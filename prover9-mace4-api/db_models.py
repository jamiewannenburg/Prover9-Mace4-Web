from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from datetime import datetime
from p9m4_types import ProcessState, ProgramType

# Create database directory if it doesn't exist
DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DB_DIR, exist_ok=True)

# Create database engine
engine = create_engine(f'sqlite:///{os.path.join(DB_DIR, "processes.db")}')
Base = declarative_base()

class ProcessModel(Base):
    __tablename__ = 'processes'

    process_id = Column(Integer, primary_key=True)
    pid = Column(Integer)
    start_time = Column(DateTime, default=datetime.now)
    state = Column(SQLEnum(ProcessState))
    program = Column(SQLEnum(ProgramType))
    input_text = Column(String)
    error = Column(String, nullable=True)
    exit_code = Column(Integer, nullable=True)
    stats = Column(String, nullable=True)
    resource_usage = Column(JSON, nullable=True)
    options = Column(JSON, nullable=True)
    fin_path = Column(String, nullable=True)
    fout_path = Column(String, nullable=True)
    ferr_path = Column(String, nullable=True)

# Create tables
Base.metadata.create_all(engine)

# Create session factory
Session = sessionmaker(bind=engine) 