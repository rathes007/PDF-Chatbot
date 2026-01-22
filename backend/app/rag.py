import os
import time
from typing import List, Tuple, Dict, Optional
from datetime import datetime
import fitz  # PyMuPDF - better PDF handling
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document
import tiktoken

# ============== GLOBAL STATE ==============
vector_store = None
retriever = None
llm = None
conversation_history: List[Dict] = []  # Conversation memory
uploaded_documents: Dict[str, int] = {}  # Track uploaded files {filename: chunk_count}

# ============== CONFIGURATION ==============
CONFIDENCE_THRESHOLD = 0.0  # Disabled - always try to answer (was 0.3)
MAX_CONVERSATION_HISTORY = 10  # Keep last N messages
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 100

# ============== GREETING/CASUAL CHAT DETECTION ==============
GREETING_PATTERNS = [
    "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
    "howdy", "greetings", "sup", "what's up", "yo", "hola", "namaste"
]

CASUAL_PATTERNS = [
    "how are you", "how's it going", "what can you do", "who are you",
    "help", "thank you", "thanks", "bye", "goodbye", "see you"
]

def is_greeting_or_casual(text: str) -> bool:
    """Check if the message is a greeting or casual conversation"""
    text_lower = text.lower().strip()
    # Check for greetings
    for pattern in GREETING_PATTERNS:
        if text_lower == pattern or text_lower.startswith(pattern + " ") or text_lower.startswith(pattern + "!") or text_lower.startswith(pattern + ","):
            return True
    # Check for casual patterns
    for pattern in CASUAL_PATTERNS:
        if pattern in text_lower:
            return True
    # Very short messages are likely casual
    if len(text_lower.split()) <= 2 and not any(c.isdigit() for c in text_lower):
        return True
    return False

def get_friendly_response(text: str) -> str:
    """Generate a friendly response for greetings and casual chat"""
    text_lower = text.lower().strip()
    
    # Greetings
    for pattern in GREETING_PATTERNS:
        if text_lower == pattern or text_lower.startswith(pattern):
            return "Hello! 👋 I'm your PDF assistant. Upload a PDF document and ask me anything about its contents. How can I help you today?"
    
    # How are you
    if "how are you" in text_lower or "how's it going" in text_lower:
        return "I'm doing great, thank you for asking! 😊 I'm ready to help you with any questions about your PDF documents."
    
    # What can you do / help
    if "what can you do" in text_lower or "help" in text_lower or "who are you" in text_lower:
        return """I'm a PDF RAG Chatbot! Here's what I can do:

📄 **Upload PDFs** - Click the upload button to add documents
❓ **Ask Questions** - I'll find answers from your documents
📍 **Citations** - I show you exactly where I found the information
📊 **Dashboard** - View metrics and usage stats

Upload a PDF to get started!"""
    
    # Thank you
    if "thank" in text_lower:
        return "You're welcome! 😊 Feel free to ask me anything else about your documents."
    
    # Goodbye
    if "bye" in text_lower or "goodbye" in text_lower or "see you" in text_lower:
        return "Goodbye! 👋 Come back anytime you need help with your PDFs!"
    
    # Default casual response
    return "I'm here to help! Upload a PDF document and ask me questions about its contents. What would you like to know?"

# ============== TOKEN COUNTING ==============
def count_tokens(text: str, model: str = "gpt-3.5-turbo") -> int:
    """Count tokens using tiktoken"""
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except:
        # Fallback: rough estimate
        return len(text) // 4

# ============== CONVERSATION MEMORY ==============
def add_to_history(role: str, content: str):
    """Add message to conversation history"""
    global conversation_history
    conversation_history.append({
        "role": role,
        "content": content,
        "timestamp": datetime.now().isoformat()
    })
    # Keep only last N messages
    if len(conversation_history) > MAX_CONVERSATION_HISTORY * 2:
        conversation_history = conversation_history[-MAX_CONVERSATION_HISTORY * 2:]

def get_conversation_context() -> str:
    """Get formatted conversation history for context"""
    if not conversation_history:
        return ""
    
    context = "Previous conversation:\n"
    for msg in conversation_history[-6:]:  # Last 3 exchanges
        role = "User" if msg["role"] == "user" else "Assistant"
        context += f"{role}: {msg['content'][:200]}\n"
    return context

def clear_conversation():
    """Clear conversation history"""
    global conversation_history
    conversation_history = []

# ============== PDF LOADING ==============
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

def load_pdf_with_pymupdf(file_path: str) -> List[Document]:
    """Load PDF using PyMuPDF which handles fonts/encoding better"""
    documents = []
    filename = os.path.basename(file_path)
    
    try:
        doc = fitz.open(file_path)
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            
            if text.strip():  # Only add non-empty pages
                documents.append(Document(
                    page_content=text,
                    metadata={
                        "page": page_num,
                        "source": file_path,
                        "filename": filename,
                        "upload_time": datetime.now().isoformat()
                    }
                ))
        doc.close()
        print(f"Loaded {len(documents)} pages from {filename}")
    except Exception as e:
        print(f"Error loading PDF: {e}")
    
    return documents

# ============== LLM INITIALIZATION ==============
def init_ollama():
    """Initialize Ollama LLM"""
    try:
        from langchain_ollama import ChatOllama
        
        model_name = os.getenv("OLLAMA_MODEL", "llama3.2")
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        
        ollama_llm = ChatOllama(
            model=model_name,
            temperature=0,
            base_url=base_url
        )
        
        # Test connection
        ollama_llm.invoke("test")
        print(f"Ollama initialized successfully with model: {model_name}")
        return ollama_llm
    except Exception as e:
        print(f"Failed to initialize Ollama: {e}")
        return None

# ============== INGESTION ==============
def ingest_pdf(file_path: str) -> int:
    """Ingest a single PDF file"""
    global vector_store, retriever, llm, uploaded_documents
    
    filename = os.path.basename(file_path)
    
    # 1. Load PDF using PyMuPDF
    documents = load_pdf_with_pymupdf(file_path)
    
    if not documents:
        raise ValueError("Could not extract text from PDF. The file may be empty or corrupted.")
    
    # 2. Split Text
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, 
        chunk_overlap=CHUNK_OVERLAP
    )
    texts = text_splitter.split_documents(documents)
    
    print(f"Split {filename} into {len(texts)} chunks")
    
    # Debug: Print first chunk
    if texts:
        print(f"Sample text: {texts[0].page_content[:200]}...")
    
    # 3. Embeddings
    embeddings = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2",
        model_kwargs={'device': 'cpu'}
    )
    
    # 4. Add to or create vector store
    persist_directory = "./chroma_db"
    
    if vector_store is None:
        # Create new vector store
        vector_store = Chroma.from_documents(
            documents=texts,
            embedding=embeddings,
            persist_directory=persist_directory
        )
    else:
        # Add to existing vector store
        vector_store.add_documents(texts)
    
    # Setup retriever
    retriever = vector_store.as_retriever(search_kwargs={"k": 5})
    
    # Initialize LLM if not done
    if llm is None:
        llm = init_ollama()
    
    # Track uploaded file
    uploaded_documents[filename] = len(texts)
    
    return len(texts)

def get_uploaded_files() -> Dict[str, int]:
    """Get list of uploaded files with chunk counts"""
    return uploaded_documents.copy()

def clear_knowledge_base():
    """Clear all documents and reset - properly clears ChromaDB"""
    global vector_store, retriever, uploaded_documents, conversation_history, llm
    
    import shutil
    persist_directory = "./chroma_db"
    
    # First, try to delete the collection properly if vector_store exists
    if vector_store is not None:
        try:
            # Try to delete the collection
            vector_store.delete_collection()
            print("✅ ChromaDB collection deleted")
        except Exception as e:
            print(f"Note: Could not delete collection: {e}")
    
    # Then remove the persist directory
    if os.path.exists(persist_directory):
        try:
            shutil.rmtree(persist_directory)
            print(f"✅ Removed {persist_directory}")
        except Exception as e:
            print(f"Warning: Could not remove {persist_directory}: {e}")
    
    # Reset all state except LLM (keep it initialized)
    vector_store = None
    retriever = None
    uploaded_documents = {}
    conversation_history = []
    
    print("✅ Knowledge base cleared completely")
    return True

# ============== RETRIEVAL WITH CONFIDENCE ==============
def retrieve_with_scores(question: str, filter_filename: Optional[str] = None) -> Tuple[List[Document], List[float]]:
    """Retrieve documents with relevance scores"""
    global vector_store
    
    if vector_store is None:
        return [], []
    
    # Build filter if filename specified
    where_filter = None
    if filter_filename:
        where_filter = {"filename": filter_filename}
    
    # Get docs with scores
    results = vector_store.similarity_search_with_relevance_scores(
        question,
        k=5,
        filter=where_filter
    )
    
    docs = [doc for doc, score in results]
    scores = [score for doc, score in results]
    
    return docs, scores

# ============== ANSWER GENERATION ==============
def get_answer(
    question: str, 
    filter_filename: Optional[str] = None,
    use_history: bool = True
) -> Tuple[str, List[str], Dict]:
    """
    Get answer with citations and metadata.
    Returns: (answer, citations, metadata)
    """
    global retriever, llm
    
    start_time = time.time()
    
    # Handle greetings and casual conversation FIRST (before checking for PDFs)
    if is_greeting_or_casual(question):
        friendly_response = get_friendly_response(question)
        add_to_history("user", question)
        add_to_history("assistant", friendly_response)
        return friendly_response, [], {
            "confidence": 1.0,
            "tokens_input": count_tokens(question),
            "tokens_output": count_tokens(friendly_response),
            "latency_ms": int((time.time() - start_time) * 1000),
            "is_casual": True
        }
    
    if vector_store is None:
        return "👋 Please upload a PDF first! Click the upload button to add a document, then ask me questions about it.", [], {
            "confidence": 0,
            "tokens_used": 0,
            "latency_ms": 0
        }
    
    # Add question to history
    add_to_history("user", question)
    
    # Get relevant documents with scores
    docs, scores = retrieve_with_scores(question, filter_filename)
    
    # Check confidence threshold
    avg_score = sum(scores) / len(scores) if scores else 0
    max_score = max(scores) if scores else 0
    
    # Build citations
    citations = []
    for i, doc in enumerate(docs):
        page = doc.metadata.get("page", "Unknown")
        filename = doc.metadata.get("filename", "Unknown")
        score = scores[i] if i < len(scores) else 0
        content_snippet = doc.page_content[:150].replace("\n", " ") + "..."
        citations.append(f"[{filename}] Page {page} (relevance: {score:.2f}): {content_snippet}")
    
    context = format_docs(docs)
    
    # Count tokens
    input_tokens = count_tokens(context + question)
    
    # DISABLED: Confidence threshold check removed - always try to answer
    # if max_score < CONFIDENCE_THRESHOLD:
    #     ... (removed)
    
    if not llm:
        # Fallback mode
        answer = f"Based on the document, here's the relevant content:\n\n{context[:1500]}..."
        add_to_history("assistant", answer)
        
        return answer, citations, {
            "confidence": max_score,
            "avg_relevance": avg_score,
            "tokens_input": input_tokens,
            "tokens_output": count_tokens(answer),
            "latency_ms": int((time.time() - start_time) * 1000),
            "llm_used": False
        }
    
    # Build prompt with conversation history
    conversation_context = get_conversation_context() if use_history else ""
    
    try:
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
        from langchain_core.runnables import RunnablePassthrough
        
        prompt_template = """You are a helpful assistant answering questions about documents.

{conversation_context}

Based ONLY on the following context from the documents, answer the question.
Be concise and specific. Give a direct answer in 1-3 sentences.
If the answer is not in the context, say "I cannot find this specific information in the uploaded documents."

Context from documents:
{context}

Question: {question}

Answer:"""
        
        prompt = ChatPromptTemplate.from_template(prompt_template)
        
        chain = (
            {
                "context": lambda x: context,
                "question": RunnablePassthrough(),
                "conversation_context": lambda x: conversation_context
            }
            | prompt
            | llm
            | StrOutputParser()
        )
        
        answer = chain.invoke(question)
        
        # Add to history
        add_to_history("assistant", answer)
        
        output_tokens = count_tokens(answer)
        latency = int((time.time() - start_time) * 1000)
        
        return answer, citations, {
            "confidence": max_score,
            "avg_relevance": avg_score,
            "tokens_input": input_tokens,
            "tokens_output": output_tokens,
            "tokens_total": input_tokens + output_tokens,
            "latency_ms": latency,
            "llm_used": True,
            "model": os.getenv("OLLAMA_MODEL", "llama3.2")
        }
        
    except Exception as e:
        print(f"LLM Error: {e}")
        answer = f"Based on the document, here's the relevant content:\n\n{context[:1500]}..."
        add_to_history("assistant", answer)
        
        return answer, citations, {
            "confidence": max_score,
            "error": str(e),
            "latency_ms": int((time.time() - start_time) * 1000)
        }
