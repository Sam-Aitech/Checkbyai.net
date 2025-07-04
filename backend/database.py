"""
Database Manager for COS Verification System
Handles DuckDB operations with updated schema
"""

import duckdb
import json
import hashlib
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

from models import StatsResponse, TrustedPattern, RecentActivity


class DatabaseManager:
    def __init__(self, db_path: str = "cos_verification.duckdb"):
        self.db_path = db_path
        self.connection = None

    async def initialize(self):
        """Initialize database connection and create tables"""
        self.connection = duckdb.connect(self.db_path)
        await self._create_tables()
        print(f"Database initialized: {self.db_path}")

    async def _create_tables(self):
        """Create database tables"""
        
        # Users table
        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Trusted COS patterns table
        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS trusted_cos_patterns (
                id INTEGER PRIMARY KEY,
                filename TEXT NOT NULL,
                upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT NOT NULL,
                pattern_hash TEXT UNIQUE,
                is_active BOOLEAN DEFAULT TRUE
            )
        """)

        # Submitted COS documents table
        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS submitted_cos (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        """)

        # Verification results table
        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS verification_results (
                id INTEGER PRIMARY KEY,
                cos_id INTEGER NOT NULL,
                result_type TEXT NOT NULL CHECK(result_type IN ('Genuine', 'Edited', 'Fake')),
                confidence REAL NOT NULL,
                mismatched_fields TEXT,
                verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(cos_id) REFERENCES submitted_cos(id)
            )
        """)

        self.connection.commit()

    async def get_statistics(self) -> StatsResponse:
        """Get system statistics"""
        # Count trusted patterns
        trusted_count = self.connection.execute(
            "SELECT COUNT(*) FROM trusted_cos_patterns WHERE is_active = TRUE"
        ).fetchone()[0]

        # Count verifications today
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        verifications_today = self.connection.execute(
            "SELECT COUNT(*) FROM verification_results WHERE verified_at >= ?",
            [today_start.isoformat()]
        ).fetchone()[0]

        # Count suspicious docs (Edited or Fake)
        suspicious_docs = self.connection.execute(
            "SELECT COUNT(*) FROM verification_results WHERE result_type IN ('Edited', 'Fake')"
        ).fetchone()[0]

        # Calculate success rate
        total_verifications = self.connection.execute(
            "SELECT COUNT(*) FROM verification_results"
        ).fetchone()[0]
        
        if total_verifications > 0:
            genuine_count = self.connection.execute(
                "SELECT COUNT(*) FROM verification_results WHERE result_type = 'Genuine'"
            ).fetchone()[0]
            success_rate = (genuine_count / total_verifications) * 100
        else:
            success_rate = 0.0

        return StatsResponse(
            trusted_patterns=trusted_count,
            verifications_today=verifications_today,
            suspicious_docs=suspicious_docs,
            success_rate=f"{success_rate:.1f}"
        )

    async def get_trusted_patterns(self) -> List[TrustedPattern]:
        """Get all trusted patterns"""
        cursor = self.connection.execute(
            "SELECT id, filename, upload_date, metadata, pattern_hash, is_active FROM trusted_cos_patterns WHERE is_active = TRUE"
        )
        patterns = []
        for row in cursor.fetchall():
            metadata = json.loads(row[3]) if row[3] else {}
            patterns.append(TrustedPattern(
                id=row[0],
                filename=row[1],
                metadata=metadata,
                patterns=metadata,  # Use metadata as patterns for compatibility
                uploaded_at=row[2],
                status='active' if row[5] else 'inactive'
            ))
        return patterns

    async def create_trusted_pattern(
        self, 
        filename: str, 
        metadata: Dict[str, Any], 
        patterns: Dict[str, Any]
    ) -> int:
        """Create a new trusted pattern"""
        # Create a hash of key metadata fields for quick comparison
        key_fields = {
            'producer': metadata.get('producer', ''),
            'creator': metadata.get('creator', ''),
            'creation_date': metadata.get('creation_date', ''),
            'pages': metadata.get('pages', 0)
        }
        pattern_hash = hashlib.md5(json.dumps(key_fields, sort_keys=True).encode()).hexdigest()
        
        # Combine metadata and patterns for storage
        combined_metadata = {**metadata, **patterns}
        
        cursor = self.connection.execute("""
            INSERT INTO trusted_cos_patterns (filename, metadata, pattern_hash, is_active)
            VALUES (?, ?, ?, TRUE)
        """, [filename, json.dumps(combined_metadata), pattern_hash])
        
        self.connection.commit()
        return cursor.lastrowid

    async def create_verification_result(
        self,
        filename: str,
        result: str,
        confidence: float,
        metadata: Dict[str, Any],
        analysis_details: Dict[str, Any],
        ip_address: Optional[str] = None,
        user_id: int = 1  # Default user for now
    ) -> int:
        """Create a new verification result"""
        # First, insert the submitted COS document
        cos_cursor = self.connection.execute("""
            INSERT INTO submitted_cos (user_id, filename, metadata)
            VALUES (?, ?, ?)
        """, [user_id, filename, json.dumps(metadata)])
        
        cos_id = cos_cursor.lastrowid
        
        # Map result types to match new schema
        result_mapping = {
            'genuine': 'Genuine',
            'suspicious': 'Edited',
            'fake': 'Fake'
        }
        result_type = result_mapping.get(result.lower(), 'Edited')
        
        # Insert verification result
        result_cursor = self.connection.execute("""
            INSERT INTO verification_results (cos_id, result_type, confidence, mismatched_fields)
            VALUES (?, ?, ?, ?)
        """, [cos_id, result_type, confidence, json.dumps(analysis_details)])
        
        self.connection.commit()
        return result_cursor.lastrowid

    async def get_recent_activity(self, limit: int = 20) -> List[RecentActivity]:
        """Get recent verification activity"""
        cursor = self.connection.execute("""
            SELECT vr.id, sc.filename, vr.result_type, vr.confidence, vr.verified_at, NULL as ip_address
            FROM verification_results vr
            JOIN submitted_cos sc ON vr.cos_id = sc.id
            ORDER BY vr.verified_at DESC
            LIMIT ?
        """, [limit])
        
        activities = []
        for row in cursor.fetchall():
            activities.append(RecentActivity(
                id=row[0],
                filename=row[1],
                result=row[2].lower(),  # Convert back to lowercase for compatibility
                confidence=row[3],
                verified_at=row[4],
                ip_address=row[5]
            ))
        return activities

    async def delete_trusted_pattern(self, pattern_id: int):
        """Delete a trusted pattern"""
        self.connection.execute(
            "UPDATE trusted_cos_patterns SET is_active = FALSE WHERE id = ?",
            [pattern_id]
        )
        self.connection.commit()

    async def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            print("Database connection closed")