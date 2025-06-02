import sqlite3
import os
from modules import config
from datetime import datetime
from dateutil.relativedelta import relativedelta  
from zoneinfo import ZoneInfo


class ScheduleDBManager:
    def __init__(self,session_id='',dbpath='schedule.db'):
        self.schedule_path=os.path.join(config.SCHEDULE_BASE_FOLDER,session_id)
        os.makedirs(self.schedule_path, exist_ok=True)
        self.schedule_db = os.path.join(self.schedule_path,dbpath)
    
    def import_database(self, binary_data: bytes):
        """
        Import the SQLite database from a binary blob.
        
        Args:
            binary_data (bytes): The binary content of the SQLite file.
        """
        with open(self.schedule_db, 'wb') as f:
            f.write(binary_data)
    
    def get_upcoming_events(self, months=1,user_timezone="Asia/Jakarta"):
        """
        Returns events starting within the upcoming `months` from today.
        
        Returns:
            List of dicts with event and event detail info.
        """
        conn = sqlite3.connect(self.schedule_db)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        today = datetime.now()
        future_date = today + relativedelta(months=months)
        
        # Format dates as ISO strings for comparison (assumes start/end stored in 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS')
        today_str = today.strftime('%Y-%m-%d')
        future_date_str = future_date.strftime('%Y-%m-%d')
        
        query = """
        SELECT e.event_id, e.title, e.description, e.repeat,
               ed.start, ed.end, ed.continue
        FROM EVENT e
        JOIN EVENT_DETAILS ed ON e.event_id = ed.event_id
        WHERE DATE(ed.start) BETWEEN DATE(?) AND DATE(?)
        ORDER BY DATE(ed.start) ASC
        """
        
        cur.execute(query, (today_str, future_date_str))
        rows = cur.fetchall()
        user_tz = ZoneInfo(user_timezone)
        events = []
        for row in rows:
            start_dt = datetime.fromisoformat(row['start']).replace(tzinfo=ZoneInfo("UTC")).astimezone(user_tz)
            end_dt = datetime.fromisoformat(row['end']).replace(tzinfo=ZoneInfo("UTC")).astimezone(user_tz)
            
            events.append({
                'event_id': row['event_id'],
                'title': row['title'],
                'description': row['description'],
                'repeat': row['repeat'],
                'start': start_dt.isoformat(),
                'end': end_dt.isoformat(),
                'continue': row['continue'],
            })
        
        conn.close()
        return events