from datetime import datetime
import pandas as pd

# Simple in-memory storage for metrics
interaction_logs = []

def log_interaction(session_id: str, question: str, answer: str, latency: float = 0.0):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "session_id": session_id,
        "question": question,
        "answer_summary": answer[:50] + "...",
        "latency": latency
    }
    interaction_logs.append(entry)

def get_metrics_summary():
    if not interaction_logs:
        return {
            "total_queries": 0,
            "avg_latency": 0,
            "recent_logs": []
        }
        
    df = pd.DataFrame(interaction_logs)
    
    return {
        "total_queries": len(interaction_logs),
        "avg_latency": df.get("latency", pd.Series([0])).mean(), # Handle missing latency
        "recent_logs": interaction_logs[-10:] # Last 10
    }
