import threading
import shelve
from typing import Optional

class SyncLock:
    """A wrapper around threading.Lock that syncs a shelve database when released."""
    
    def __init__(self, db: Optional[shelve.Shelf] = None):
        """Initialize the lock with an optional shelve database to sync.
        
        Args:
            db: Optional shelve database to sync when lock is released
        """
        self._lock = threading.Lock()
        self._db = db
    
    def acquire(self, blocking: bool = True, timeout: float = -1) -> bool:
        """Acquire the lock.
        
        Args:
            blocking: Whether to block until lock is acquired
            timeout: Timeout in seconds (-1 for no timeout)
            
        Returns:
            bool: True if lock was acquired, False otherwise
        """
        return self._lock.acquire(blocking, timeout)
    
    def release(self) -> None:
        """Release the lock and sync the database if one was provided."""
        try:
            if self._db is not None:
                self._db.sync()
        finally:
            self._lock.release()
    
    def __enter__(self):
        """Context manager entry."""
        self.acquire()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.release() 