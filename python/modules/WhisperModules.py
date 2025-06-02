import os
import sys
import whisper
import urllib.request
import zipfile
import platform
import subprocess
from pathlib import Path
import shutil
import tempfile
import numpy as np

class WhisperNoFFmpeg:
    def __init__(self, model_name="base", verbose=True):
        self.model_name = model_name
        self.verbose = verbose
        
        # Load the Whisper model
        if self.verbose:
            print(f"Loading Whisper model '{model_name}'...")
        self.model = whisper.load_model(model_name)
        if self.verbose:
            print(f"Model loaded successfully!")
    
    def _log(self, message):
        """Print message if verbose mode is enabled."""
        if self.verbose:
            print(message)
            
    def _load_audio_direct(self, file_path):
        """
        Load an audio file directly, bypassing Whisper's FFmpeg dependency.
        Uses Python libraries to read common audio formats.
        
        This doesn't support as many formats as FFmpeg but works for common ones.
        """
        self._log(f"Loading audio directly: {file_path}")
        
        try:
            # Try using soundfile first (good for WAV files)
            import soundfile as sf
            audio, sr = sf.read(file_path)
            
            # Convert to mono if needed
            if len(audio.shape) > 1 and audio.shape[1] > 1:
                audio = audio.mean(axis=1)
                
            # Resample to 16kHz if needed
            if sr != 16000:
                self._log(f"Resampling from {sr}Hz to 16000Hz")
                try:
                    from librosa import resample
                    audio = resample(y=audio, orig_sr=sr, target_sr=16000)
                except ImportError:
                    # Simple resampling if librosa not available
                    import scipy.signal
                    audio = scipy.signal.resample_poly(audio, 16000, sr)
            
            # Get audio into the right type and shape
            audio = audio.astype(np.float32)
            
            self._log("Audio loaded successfully via soundfile")
            return audio
            
        except ImportError:
            self._log("soundfile not available, trying librosa...")
            
        try:
            # Fallback to librosa (handles more formats but has more dependencies)
            import librosa
            audio, sr = librosa.load(file_path, sr=16000, mono=True)
            self._log("Audio loaded successfully via librosa")
            return audio
            
        except ImportError:
            self._log("librosa not available, trying pydub...")
            
        try:
            # Fallback to pydub (requires ffmpeg but handles it differently)
            from pydub import AudioSegment
            import numpy as np
            
            self._log("Loading with pydub...")
            audio = AudioSegment.from_file(file_path)
            
            # Convert to mono if needed
            if audio.channels > 1:
                audio = audio.set_channels(1)
                
            # Convert to 16kHz
            if audio.frame_rate != 16000:
                audio = audio.set_frame_rate(16000)
                
            # Convert to numpy array
            samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
            samples = samples / (1 << (8 * audio.sample_width - 1))  # Convert to float32
            
            self._log("Audio loaded successfully via pydub")
            return samples
            
        except ImportError:
            raise ImportError("Could not find any suitable audio loading library. Please install either soundfile, librosa, or pydub.")
        except Exception as e:
            raise RuntimeError(f"Failed to load audio file: {str(e)}")
    
    def _prepare_audio(self, file_path):
        """Load audio, convert to correct format/sample rate and return as a numpy array."""
        try:
            # Try loading audio directly with available libraries
            audio = self._load_audio_direct(file_path)
            return audio
        except Exception as e:
            self._log(f"Direct audio loading failed: {str(e)}")
            
            # If direct loading failed, try using the embedded FFmpeg helper
            self._log("Attempting to use embedded FFmpeg helper...")
            return self._convert_audio_with_embedded_ffmpeg(file_path)
            
    def _convert_audio_with_embedded_ffmpeg(self, file_path):
        """A fallback method that uses embedded FFmpeg when other methods fail."""
        
        # First make sure FFmpeg is available
        ffmpeg_path = self._get_ffmpeg_path()
        if not ffmpeg_path:
            raise RuntimeError("Could not find or set up FFmpeg")
        
        # Convert to WAV format for compatibility
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_wav = temp_file.name
        
        self._log(f"Converting {file_path} to temporary WAV: {temp_wav}")
        
        try:
            # Run FFmpeg to convert the file to WAV
            cmd = [
                ffmpeg_path,
                '-i', file_path,
                '-ar', '16000',  # 16kHz sample rate
                '-ac', '1',      # Mono
                '-c:a', 'pcm_s16le',  # 16-bit PCM
                '-y',            # Overwrite without asking
                temp_wav
            ]
            
            subprocess.run(cmd, check=True, capture_output=True)
            
            # Load the WAV file
            import soundfile as sf
            audio, sr = sf.read(temp_wav)
            
            # Clean up
            os.unlink(temp_wav)
            
            # Convert to float32
            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)
                
            # Normalize if int16
            if np.max(np.abs(audio)) > 1.0:
                audio = audio / 32768.0
                
            return audio
            
        except Exception as e:
            # Clean up temp file if it exists
            if os.path.exists(temp_wav):
                os.unlink(temp_wav)
            raise RuntimeError(f"Failed to convert audio with FFmpeg: {str(e)}")
    
    def _get_ffmpeg_path(self):
        """Helper function to find or download FFmpeg if needed."""
        # Try to find system FFmpeg first
        ffmpeg_path = self._find_system_ffmpeg()
        if ffmpeg_path:
            return ffmpeg_path
            
        # If no system FFmpeg, set up our own
        ffmpeg_setup = FFmpegSetup(verbose=self.verbose)
        return ffmpeg_setup.get_ffmpeg_path()
        
    def _find_system_ffmpeg(self):
        """Try to find system FFmpeg executable."""
        try:
            if platform.system().lower() == "windows":
                # On Windows, use where command
                result = subprocess.run(["where", "ffmpeg"], 
                                       capture_output=True, 
                                       text=True, 
                                       check=False)
                if result.returncode == 0:
                    return result.stdout.strip().split('\n')[0]
            else:
                # On Unix-like systems, use which command
                result = subprocess.run(["which", "ffmpeg"], 
                                       capture_output=True, 
                                       text=True, 
                                       check=False)
                if result.returncode == 0:
                    return result.stdout.strip()
                    
            return None
        except Exception:
            return None
            
    def transcribe(self, audio_path, **options):
        """
        Transcribe audio file using Whisper model.
        
        Args:
            audio_path (str): Path to the audio file
            **options: Additional options to pass to Whisper's transcribe function
            
        Returns:
            dict: Transcription result from Whisper
        """
        # Verify the audio file exists
        audio_path_obj = Path(audio_path)
        if not audio_path_obj.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        # Use absolute path
        audio_path = str(audio_path_obj.absolute())
        self._log(f"Transcribing audio file: {audio_path}")
        
        try:
            # Load and prepare audio
            audio_data = self._prepare_audio(audio_path)
            
            # Call Whisper's transcribe function with the prepared audio
            self._log("Starting transcription...")
            result = self.model.transcribe(audio_data, **options)
            self._log("Transcription completed successfully")
            
            return result
            
        except Exception as e:
            self._log(f"Transcription failed: {str(e)}")
            raise


class FFmpegSetup:
    """Helper class to download and set up FFmpeg if needed."""
    
    def __init__(self, verbose=True):
        self.verbose = verbose
        self.ffmpeg_dir = self._get_ffmpeg_dir()
        self.ffmpeg_path = None
        self._setup_ffmpeg()
        
    def _log(self, message):
        """Print message if verbose mode is enabled."""
        if self.verbose:
            print(message)
            
    def _get_ffmpeg_dir(self):
        """Create a directory for storing FFmpeg binaries."""
        # Create directory in user's home folder
        home_dir = Path.home()
        ffmpeg_dir = home_dir / ".embedded_ffmpeg"
        
        if not ffmpeg_dir.exists():
            self._log(f"Creating FFmpeg directory at {ffmpeg_dir}")
            ffmpeg_dir.mkdir(parents=True, exist_ok=True)
            
        return ffmpeg_dir
        
    def _setup_ffmpeg(self):
        """Download and set up FFmpeg if not already available."""
        # Check if FFmpeg already exists in our directory
        if self._check_existing_ffmpeg():
            self._log(f"Found existing FFmpeg installation at {self.ffmpeg_path}")
            return
            
        # Determine which FFmpeg to download based on the platform
        system = platform.system().lower()
        
        self._log(f"No existing FFmpeg found. Downloading for {system}...")
        
        try:
            if system == "windows":
                self._setup_ffmpeg_windows()
            elif system == "darwin":  # macOS
                self._setup_ffmpeg_macos()
            elif system == "linux":
                self._setup_ffmpeg_linux()
            else:
                raise RuntimeError(f"Unsupported operating system: {system}")
                
            # Verify FFmpeg works
            if not self._verify_ffmpeg():
                raise RuntimeError("FFmpeg installation failed verification")
                
        except Exception as e:
            self._log(f"Error setting up FFmpeg: {str(e)}")
            raise
            
    def _check_existing_ffmpeg(self):
        """Check if FFmpeg is already in our directory."""
        system = platform.system().lower()
        
        if system == "windows":
            ffmpeg_exe = self.ffmpeg_dir / "ffmpeg.exe"
            if ffmpeg_exe.exists():
                self.ffmpeg_path = str(ffmpeg_exe)
                return True
        else:
            ffmpeg_exe = self.ffmpeg_dir / "ffmpeg"
            if ffmpeg_exe.exists() and os.access(str(ffmpeg_exe), os.X_OK):
                self.ffmpeg_path = str(ffmpeg_exe)
                return True
        return False
        
    def _verify_ffmpeg(self):
        """Verify FFmpeg works by running a simple command."""
        try:
            result = subprocess.run([self.ffmpeg_path, "-version"], 
                                   capture_output=True, 
                                   text=True, 
                                   check=False)
            if result.returncode == 0:
                self._log("FFmpeg verification successful")
                return True
            else:
                self._log(f"FFmpeg verification failed: {result.stderr}")
                return False
        except Exception as e:
            self._log(f"FFmpeg verification error: {str(e)}")
            return False
            
    def _setup_ffmpeg_windows(self):
        """Download and set up FFmpeg for Windows."""
        # URL for the latest FFmpeg build for Windows (static build)
        url = "https://github.com/GyanD/codexffmpeg/releases/download/6.1.1/ffmpeg-6.1.1-essentials_build.zip"
        
        # Create a temporary directory for downloading
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            zip_path = temp_dir_path / "ffmpeg.zip"
            
            # Download FFmpeg
            self._log("Downloading FFmpeg for Windows...")
            try:
                urllib.request.urlretrieve(url, zip_path)
            except Exception as e:
                raise RuntimeError(f"Failed to download FFmpeg: {str(e)}")
            
            # Extract FFmpeg
            self._log("Extracting FFmpeg...")
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir_path)
            except Exception as e:
                raise RuntimeError(f"Failed to extract FFmpeg: {str(e)}")
            
            # Find the extracted FFmpeg executable
            ffmpeg_exes = list(temp_dir_path.glob("**/ffmpeg.exe"))
            if not ffmpeg_exes:
                raise RuntimeError("Failed to find FFmpeg executable after extraction")
                
            ffmpeg_exe = ffmpeg_exes[0]
            
            # Copy FFmpeg to our directory
            dest_path = self.ffmpeg_dir / "ffmpeg.exe"
            self._log(f"Copying FFmpeg to {dest_path}")
            shutil.copy(ffmpeg_exe, dest_path)
            self.ffmpeg_path = str(dest_path)
            
    def _setup_ffmpeg_macos(self):
        """Download and set up FFmpeg for macOS."""
        # URL for the latest FFmpeg build for macOS
        url = "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
        
        # Create a temporary directory for downloading
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            zip_path = temp_dir_path / "ffmpeg.zip"
            
            # Download FFmpeg
            self._log("Downloading FFmpeg for macOS...")
            try:
                urllib.request.urlretrieve(url, zip_path)
            except Exception as e:
                raise RuntimeError(f"Failed to download FFmpeg: {str(e)}")
            
            # Extract FFmpeg
            self._log("Extracting FFmpeg...")
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir_path)
            except Exception as e:
                raise RuntimeError(f"Failed to extract FFmpeg: {str(e)}")
            
            ffmpeg_exe = temp_dir_path / "ffmpeg"
            
            if not ffmpeg_exe.exists():
                # Try to find ffmpeg directly
                ffmpeg_exes = list(temp_dir_path.glob("**/ffmpeg"))
                if not ffmpeg_exes:
                    raise RuntimeError("Failed to find FFmpeg executable after extraction")
                ffmpeg_exe = ffmpeg_exes[0]
            
            # Copy FFmpeg to our directory
            dest_path = self.ffmpeg_dir / "ffmpeg"
            self._log(f"Copying FFmpeg to {dest_path}")
            shutil.copy(ffmpeg_exe, dest_path)
            
            # Make it executable
            os.chmod(dest_path, 0o755)
            self.ffmpeg_path = str(dest_path)
            
    def _setup_ffmpeg_linux(self):
        """Download and set up FFmpeg for Linux."""
        # For Linux, we'll use a static build
        url = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
        
        # Create a temporary directory for downloading
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            tar_path = temp_dir_path / "ffmpeg.tar.xz"
            
            # Download FFmpeg
            self._log("Downloading FFmpeg for Linux...")
            try:
                urllib.request.urlretrieve(url, tar_path)
            except Exception as e:
                raise RuntimeError(f"Failed to download FFmpeg: {str(e)}")
            
            # Extract FFmpeg
            self._log("Extracting FFmpeg...")
            try:
                # First try using Python's shutil
                shutil.unpack_archive(str(tar_path), str(temp_dir_path))
            except Exception:
                # If that fails, try using the tar command
                try:
                    subprocess.run(["tar", "-xf", str(tar_path), "-C", str(temp_dir_path)], 
                                  check=True, 
                                  stdout=subprocess.PIPE, 
                                  stderr=subprocess.PIPE)
                except Exception as e:
                    raise RuntimeError(f"Failed to extract FFmpeg: {str(e)}")
            
            # Find the extracted FFmpeg executable
            ffmpeg_exes = list(temp_dir_path.glob("**/ffmpeg"))
            if not ffmpeg_exes:
                raise RuntimeError("Failed to find FFmpeg executable after extraction")
                
            ffmpeg_exe = ffmpeg_exes[0]
            
            # Copy FFmpeg to our directory
            dest_path = self.ffmpeg_dir / "ffmpeg"
            self._log(f"Copying FFmpeg to {dest_path}")
            shutil.copy(ffmpeg_exe, dest_path)
            
            # Make it executable
            os.chmod(dest_path, 0o755)
            self.ffmpeg_path = str(dest_path)
            
    def get_ffmpeg_path(self):
        """Return the path to the installed FFmpeg."""
        return self.ffmpeg_path


# Helper function to install required dependencies
def install_required_packages():
    """Install required packages if they're not already installed."""
    try:
        # Try importing each package to check if it's installed
        import soundfile
        print("soundfile is already installed")
    except ImportError:
        print("Installing soundfile...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "soundfile"])
    
    try:
        import numpy
        print("numpy is already installed")
    except ImportError:
        print("Installing numpy...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "numpy"])


# Example usage
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python whisper_no_ffmpeg.py path_to_audio.mp3 [model_name]")
        sys.exit(1)
    
    # Install required dependencies
    install_required_packages()
    
    audio_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "base"
    
    try:
        transcriber = WhisperNoFFmpeg(model_name, verbose=True)
        result = transcriber.transcribe(audio_path)
        print("\nTranscription result:")
        print(result["text"])
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()