from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/fmcg_db" # Default local postgres config
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class FMCGSku(Base):
    __tablename__ = "fmcg_skus"

    id = Column(Integer, primary_key=True, index=True)
    brand = Column(String, index=True)
    sku = Column(String, index=True)
    category = Column(String)
    packaging = Column(String)
    colors = Column(String)
    barcode = Column(String, index=True)

def init_db():
    # Only run once on system setup
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
