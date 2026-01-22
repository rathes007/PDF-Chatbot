from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import shutil
import os
from typing import List, Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from .rag import ingest_pdf, get_answer
from .observability import log_interaction, get_metrics_summary
import time

app = FastAPI(title="PDF RAG Chatbot", description="Chat with your PDFs with observability")

# CORS Setup
origins = [
    "http://localhost:5173",  # Vite default
    "http://localhost:5174",  # Vite fallback
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    question: str
    session_id: str

class ChatResponse(BaseModel):
    answer: str
    citations: List[str]

@app.get("/")
async def root():
    return {"message": "PDF RAG Chatbot API is running"}

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    # Note: Embeddings now use free local HuggingFace model
    # Google API key is optional (only needed for LLM responses)
    
    try:
        # Save temp file
        temp_dir = "temp_pdfs"
        os.makedirs(temp_dir, exist_ok=True)
        file_path = os.path.join(temp_dir, file.filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Ingest PDF
        num_chunks = ingest_pdf(file_path)
        
        return {"filename": file.filename, "status": "Uploaded and processed", "chunks": num_chunks}
    except ValueError as ve:
        # Specific error for missing API key from RAG module
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        print(f"Upload error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    start_time = time.time()
    try:
        # Get answer
        answer, citations = get_answer(request.question)
        
        duration = time.time() - start_time
        
        # Log interaction
        log_interaction(request.session_id, request.question, answer, latency=duration)
        
        return ChatResponse(answer=answer, citations=citations)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/metrics")
async def get_metrics():
    # Return observability metrics
    return get_metrics_summary()

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
