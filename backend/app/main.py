"""
PDF RAG Chatbot API
Features:
- Multi-file upload
- Conversation memory
- Token tracking
- Confidence threshold
- Enhanced metrics
"""
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn
import shutil
import os
from typing import List, Optional, Dict
from dotenv import load_dotenv
import time

# Load environment variables from .env file
load_dotenv()

from .rag import (
    ingest_pdf, 
    get_answer, 
    get_uploaded_files, 
    clear_knowledge_base,
    clear_conversation,
    conversation_history
)
from .observability import (
    log_interaction, 
    get_metrics_summary, 
    log_error,
    get_interaction_history,
    clear_metrics
)

app = FastAPI(
    title="PDF RAG Chatbot",
    description="Chat with your PDFs - with conversation memory, citations, and observability",
    version="2.0.0"
)

# CORS Setup - Allow all origins for development
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "*"  # Allow all for testing
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for easy testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============== REQUEST/RESPONSE MODELS ==============

class ChatRequest(BaseModel):
    question: str
    session_id: str = "default"
    filter_filename: Optional[str] = None  # Optional: filter by specific file
    use_history: bool = True  # Use conversation memory

class ChatResponse(BaseModel):
    answer: str
    citations: List[str]
    metadata: Dict

class UploadResponse(BaseModel):
    filename: str
    status: str
    chunks: int
    total_files: int

# ============== ENDPOINTS ==============

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "PDF RAG Chatbot API is running",
        "version": "2.0.0",
        "features": [
            "Multi-file upload",
            "Conversation memory",
            "Token tracking",
            "Confidence threshold",
            "Document filtering",
            "Enhanced observability"
        ]
    }

@app.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload and process a PDF file.
    Supports multiple files - each upload adds to the knowledge base.
    """
    try:
        # Validate file type
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
        # Save temp file
        temp_dir = "temp_pdfs"
        os.makedirs(temp_dir, exist_ok=True)
        file_path = os.path.join(temp_dir, file.filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Ingest PDF
        num_chunks = ingest_pdf(file_path)
        
        # Get total files count
        uploaded = get_uploaded_files()
        
        return UploadResponse(
            filename=file.filename,
            status="Uploaded and processed successfully",
            chunks=num_chunks,
            total_files=len(uploaded)
        )
        
    except ValueError as ve:
        log_error("upload_error", str(ve), {"filename": file.filename})
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        log_error("upload_error", str(e), {"filename": file.filename})
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat with the uploaded documents.
    Features:
    - Conversation memory (remembers previous questions)
    - Confidence threshold (refuses if not confident)
    - Document filtering (query specific file)
    - Token tracking
    """
    start_time = time.time()
    
    try:
        # Get answer with all metadata
        answer, citations, metadata = get_answer(
            question=request.question,
            filter_filename=request.filter_filename,
            use_history=request.use_history
        )
        
        duration = time.time() - start_time
        
        # Log interaction with full metrics
        log_interaction(
            session_id=request.session_id,
            question=request.question,
            answer=answer,
            latency=duration,
            tokens_input=metadata.get("tokens_input", 0),
            tokens_output=metadata.get("tokens_output", 0),
            confidence=metadata.get("confidence", 0),
            model=metadata.get("model", "unknown"),
            was_refused=metadata.get("refused", False),
            filter_used=request.filter_filename
        )
        
        return ChatResponse(
            answer=answer,
            citations=citations,
            metadata=metadata
        )
        
    except Exception as e:
        log_error("chat_error", str(e), {"question": request.question[:100]})
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/files")
async def list_files():
    """List all uploaded files with chunk counts"""
    return {
        "files": get_uploaded_files(),
        "total_files": len(get_uploaded_files())
    }

@app.delete("/files")
async def delete_all_files():
    """Clear all uploaded documents and reset knowledge base"""
    try:
        clear_knowledge_base()
        clear_metrics()
        return {"status": "Knowledge base cleared", "files_remaining": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/conversation")
async def clear_chat_history():
    """Clear conversation memory"""
    clear_conversation()
    return {"status": "Conversation history cleared"}

@app.get("/conversation")
async def get_chat_history():
    """Get current conversation history"""
    return {
        "history": conversation_history,
        "message_count": len(conversation_history)
    }

@app.get("/metrics")
async def get_metrics():
    """
    Get comprehensive metrics including:
    - Total queries, average latency, p50/p95 latency
    - Token usage
    - Confidence scores
    - Error rates
    - Daily stats
    """
    return get_metrics_summary()

@app.get("/metrics/history")
async def get_history(
    session_id: Optional[str] = Query(None, description="Filter by session"),
    limit: int = Query(50, description="Max results")
):
    """Get detailed interaction history"""
    return {
        "interactions": get_interaction_history(session_id, limit)
    }

# ============== STATIC FILE SERVING (for sharing via ngrok) ==============
# Path to frontend build directory - using absolute path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_BUILD_DIR = os.path.join(BACKEND_DIR, "..", "frontend", "dist")
FRONTEND_BUILD_DIR = os.path.abspath(FRONTEND_BUILD_DIR)  # Normalize the path

print(f"Looking for frontend build at: {FRONTEND_BUILD_DIR}")
print(f"Frontend build exists: {os.path.exists(FRONTEND_BUILD_DIR)}")

# Check if frontend build exists and mount it
if os.path.exists(FRONTEND_BUILD_DIR):
    print(f"✅ Mounting frontend from: {FRONTEND_BUILD_DIR}")
    
    # Serve static assets (js, css, etc.)
    assets_dir = os.path.join(FRONTEND_BUILD_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    
    # Serve index.html for the app route
    @app.get("/app")
    async def serve_spa():
        """Serve the React SPA"""
        return FileResponse(os.path.join(FRONTEND_BUILD_DIR, "index.html"))
    
    @app.get("/app/{full_path:path}")
    async def serve_spa_path(full_path: str):
        """Serve the React SPA for sub-routes"""
        return FileResponse(os.path.join(FRONTEND_BUILD_DIR, "index.html"))
else:
    print(f"⚠️ Frontend build not found at: {FRONTEND_BUILD_DIR}")
    print("Run 'npm run build' in the frontend folder to create the build")

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
