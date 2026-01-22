"""
Enhanced Observability Module
Tracks: queries, latency, tokens, errors, and more
"""
import os
from datetime import datetime
from typing import Dict, List, Optional
import json

# In-memory storage for metrics (use Redis/DB in production)
interactions_log: List[Dict] = []
error_log: List[Dict] = []
daily_stats: Dict[str, Dict] = {}

def log_interaction(
    session_id: str,
    question: str,
    answer: str,
    latency: float,
    tokens_input: int = 0,
    tokens_output: int = 0,
    confidence: float = 0,
    model: str = "unknown",
    was_refused: bool = False,
    filter_used: Optional[str] = None
):
    """Log a chat interaction with full metrics"""
    timestamp = datetime.now()
    date_key = timestamp.strftime("%Y-%m-%d")
    
    interaction = {
        "timestamp": timestamp.isoformat(),
        "session_id": session_id,
        "question": question[:200],  # Truncate for storage
        "answer_preview": answer[:100],
        "latency_ms": int(latency * 1000) if latency < 100 else int(latency),
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
        "tokens_total": tokens_input + tokens_output,
        "confidence": round(confidence, 3),
        "model": model,
        "was_refused": was_refused,
        "filter_used": filter_used
    }
    
    interactions_log.append(interaction)
    
    # Update daily stats
    if date_key not in daily_stats:
        daily_stats[date_key] = {
            "total_queries": 0,
            "total_tokens": 0,
            "total_latency_ms": 0,
            "refused_count": 0,
            "error_count": 0
        }
    
    daily_stats[date_key]["total_queries"] += 1
    daily_stats[date_key]["total_tokens"] += tokens_input + tokens_output
    daily_stats[date_key]["total_latency_ms"] += interaction["latency_ms"]
    if was_refused:
        daily_stats[date_key]["refused_count"] += 1
    
    # Keep only last 1000 interactions in memory
    if len(interactions_log) > 1000:
        interactions_log.pop(0)

def log_error(
    error_type: str,
    error_message: str,
    context: Optional[Dict] = None
):
    """Log an error"""
    timestamp = datetime.now()
    date_key = timestamp.strftime("%Y-%m-%d")
    
    error = {
        "timestamp": timestamp.isoformat(),
        "type": error_type,
        "message": error_message[:500],
        "context": context or {}
    }
    
    error_log.append(error)
    
    # Update daily error count
    if date_key in daily_stats:
        daily_stats[date_key]["error_count"] += 1
    
    # Keep only last 100 errors
    if len(error_log) > 100:
        error_log.pop(0)

def get_metrics_summary() -> Dict:
    """Get comprehensive metrics summary"""
    if not interactions_log:
        return {
            "total_queries": 0,
            "average_latency_ms": 0,
            "total_tokens": 0,
            "recent_interactions": [],
            "daily_stats": {},
            "error_count": len(error_log)
        }
    
    # Calculate averages
    total_queries = len(interactions_log)
    avg_latency = sum(i["latency_ms"] for i in interactions_log) / total_queries
    total_tokens = sum(i["tokens_total"] for i in interactions_log)
    avg_confidence = sum(i["confidence"] for i in interactions_log) / total_queries
    refused_count = sum(1 for i in interactions_log if i.get("was_refused", False))
    
    # Latency percentiles
    latencies = sorted([i["latency_ms"] for i in interactions_log])
    p50_idx = len(latencies) // 2
    p95_idx = int(len(latencies) * 0.95)
    
    return {
        "total_queries": total_queries,
        "average_latency_ms": round(avg_latency, 2),
        "p50_latency_ms": latencies[p50_idx] if latencies else 0,
        "p95_latency_ms": latencies[p95_idx] if len(latencies) > 1 else latencies[-1] if latencies else 0,
        "total_tokens": total_tokens,
        "avg_tokens_per_query": round(total_tokens / total_queries, 2) if total_queries else 0,
        "average_confidence": round(avg_confidence, 3),
        "refused_rate": round(refused_count / total_queries * 100, 1) if total_queries else 0,
        "error_count": len(error_log),
        "recent_interactions": interactions_log[-10:][::-1],  # Last 10, newest first
        "recent_errors": error_log[-5:][::-1],  # Last 5 errors
        "daily_stats": dict(list(daily_stats.items())[-7:])  # Last 7 days
    }

def get_interaction_history(
    session_id: Optional[str] = None,
    limit: int = 50
) -> List[Dict]:
    """Get interaction history, optionally filtered by session"""
    if session_id:
        filtered = [i for i in interactions_log if i["session_id"] == session_id]
        return filtered[-limit:][::-1]
    return interactions_log[-limit:][::-1]

def clear_metrics():
    """Clear all metrics (for testing)"""
    global interactions_log, error_log, daily_stats
    interactions_log = []
    error_log = []
    daily_stats = {}
    return True
