import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

import duckdb

from .models import StatsResponse, TrustedPattern, RecentActivity


class DatabaseManager:
    def __init__(self, db_path: str = "cos_verification.duckdb"):
        self.db_path = db_path
        self.connection = None

    async def initialize(self):
        """Initialize database connection and create tables"""
        self.connection = duckdb.connect(self.db_path)
        await self._create_tables()

    async def _create_tables(self):
        """Create database tables"""
        # Users table
        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username VARCHAR UNIQUE NOT NULL,
                password VARCHAR NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Trusted patterns table
        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS trusted_patterns (
                id INTEGER PRIMARY KEY,
                filename VARCHAR NOT NULL,
                metadata JSON NOT NULL,
                patterns JSON NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR DEFAULT 'active'
            )
        """)

        # Verification results table
        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS verification_results (
                id INTEGER PRIMARY KEY,
                filename VARCHAR NOT NULL,
                result VARCHAR NOT NULL,
                confidence REAL NOT NULL,
                metadata JSON NOT NULL,
                analysis_details JSON,
                ip_address VARCHAR,
                verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        self.connection.commit()

    async def get_statistics(self) -> StatsResponse:
        """Get system statistics"""
        # Count trusted patterns
        trusted_count = self.connection.execute(
            "SELECT COUNT(*) FROM trusted_patterns WHERE status = 'active'"
        ).fetchone()[0]

        # Count verifications today
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        verifications_today = self.connection.execute(
            "SELECT COUNT(*) FROM verification_results WHERE verified_at >= ?",
            [today_start]
        ).fetchone()[0]

        # Count suspicious documents
        suspicious_count = self.connection.execute(
            "SELECT COUNT(*) FROM verification_results WHERE result = 'suspicious'"
        ).fetchone()[0]

        # Calculate success rate
        total_verifications = self.connection.execute(
            "SELECT COUNT(*) FROM verification_results"
        ).fetchone()[0]

        genuine_count = self.connection.execute(
            "SELECT COUNT(*) FROM verification_results WHERE result = 'genuine'"
        ).fetchone()[0]

        success_rate = "0.0"
        if total_verifications > 0:
            success_count = genuine_count + suspicious_count
            success_rate = f"{(success_count / total_verifications * 100):.1f}"

        return StatsResponse(
            trusted_patterns=trusted_count,
            verifications_today=verifications_today,
            suspicious_docs=suspicious_count,
            success_rate=success_rate
        )

    async def get_trusted_patterns(self) -> List[TrustedPattern]:
        """Get all trusted patterns"""
        results = self.connection.execute("""
            SELECT id, filename, metadata, patterns, uploaded_at, status 
            FROM trusted_patterns 
            ORDER BY uploaded_at DESC
        """).fetchall()

        patterns = []
        for row in results:
            patterns.append(TrustedPattern(
                id=row[0],
                filename=row[1],
                metadata=json.loads(row[2]) if isinstance(row[2], str) else row[2],
                patterns=json.loads(row[3]) if isinstance(row[3], str) else row[3],
                uploaded_at=row[4],
                status=row[5]
            ))

        return patterns

    async def create_trusted_pattern(
        self, 
        filename: str, 
        metadata: Dict[str, Any], 
        patterns: Dict[str, Any]
    ) -> int:
        """Create a new trusted pattern"""
        result = self.connection.execute("""
            INSERT INTO trusted_patterns (filename, metadata, patterns, status)
            VALUES (?, ?, ?, 'active')
            RETURNING id
        """, [filename, json.dumps(metadata), json.dumps(patterns)])
        
        pattern_id = result.fetchone()[0]
        self.connection.commit()
        return pattern_id

    async def delete_trusted_pattern(self, pattern_id: int):
        """Delete a trusted pattern"""
        self.connection.execute(
            "DELETE FROM trusted_patterns WHERE id = ?",
            [pattern_id]
        )
        self.connection.commit()

    async def create_verification_result(
        self,
        filename: str,
        result: str,
        confidence: float,
        metadata: Dict[str, Any],
        analysis_details: Dict[str, Any],
        ip_address: Optional[str] = None
    ) -> int:
        """Create a new verification result"""
        result_row = self.connection.execute("""
            INSERT INTO verification_results 
            (filename, result, confidence, metadata, analysis_details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id
        """, [
            filename, 
            result, 
            confidence, 
            json.dumps(metadata), 
            json.dumps(analysis_details),
            ip_address
        ])
        
        result_id = result_row.fetchone()[0]
        self.connection.commit()
        return result_id

    async def get_recent_activity(self, limit: int = 20) -> List[RecentActivity]:
        """Get recent verification activity"""
        results = self.connection.execute("""
            SELECT id, filename, result, confidence, verified_at, ip_address
            FROM verification_results 
            ORDER BY verified_at DESC 
            LIMIT ?
        """, [limit]).fetchall()

        activity = []
        for row in results:
            activity.append(RecentActivity(
                id=row[0],
                filename=row[1],
                result=row[2],
                confidence=row[3],
                verified_at=row[4],
                ip_address=row[5]
            ))

        return activity

    async def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            self.connection = None