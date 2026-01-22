# PDF RAG Chatbot

A modern chatbot application that allows you to upload PDF documents and chat with them using RAG (Retrieval Augmented Generation). Features a sleek UI and an observability dashboard.

## Features
- **PDF Ingestion**: Upload and process PDF files.
- **RAG Chat**: Ask questions and get answers with citations.
- **Observability**: Track query latency and usage metrics.
- **Theming**: Light/Dark mode.

## Prerequisites
- Python 3.10+
- Node.js 18+
- OpenAI API Key

## Setup

### 1. Backend
Navigate to `backend` directory and install dependencies:
```bash
cd backend
pip install -r requirements.txt
```
Make sure to set your OpenAI API Key:
```bash
# Windows PowerShell
$env:OPENAI_API_KEY="sk-..."
```
Run the server:
```bash
python -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend
Navigate to `frontend` directory and install dependencies:
```bash
cd frontend
npm install
```
Run the development server:
```bash
npm run dev
```

## Usage
1. Open the frontend URL (usually `http://localhost:5173`).
2. Go to "Chat" tab.
3. Upload a PDF file.
4. Ask questions!
5. Check "Dashboard" to see metrics.
