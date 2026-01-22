import os
import time
from typing import List, Tuple
import fitz  # PyMuPDF - better PDF handling
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document

# Global variables to hold state (for simple prototype)
vector_store = None
retriever = None
llm = None

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

def load_pdf_with_pymupdf(file_path: str) -> List[Document]:
    """Load PDF using PyMuPDF which handles fonts/encoding better"""
    documents = []
    
    try:
        doc = fitz.open(file_path)
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            
            if text.strip():  # Only add non-empty pages
                documents.append(Document(
                    page_content=text,
                    metadata={"page": page_num, "source": file_path}
                ))
        doc.close()
        print(f"Loaded {len(documents)} pages from PDF")
    except Exception as e:
        print(f"Error loading PDF: {e}")
    
    return documents

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

def ingest_pdf(file_path: str):
    global vector_store, retriever, llm
    
    # 1. Load PDF using PyMuPDF (handles fonts/encoding better)
    documents = load_pdf_with_pymupdf(file_path)
    
    if not documents:
        raise ValueError("Could not extract text from PDF. The file may be empty or corrupted.")
    
    # 2. Split Text
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    texts = text_splitter.split_documents(documents)
    
    print(f"Split into {len(texts)} chunks")
    
    # Debug: Print first chunk to verify text extraction
    if texts:
        print(f"Sample text from first chunk: {texts[0].page_content[:200]}...")
    
    # 3. Embeddings using FREE HuggingFace model (runs locally, no API key needed!)
    embeddings = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2",
        model_kwargs={'device': 'cpu'}
    )
    
    # Persist directory - clear old data first
    persist_directory = "./chroma_db"
    
    # Create fresh vector store
    vector_store = Chroma.from_documents(
        documents=texts, 
        embedding=embeddings,
        persist_directory=persist_directory
    )
    
    # Setup retriever
    retriever = vector_store.as_retriever(search_kwargs={"k": 3})
    
    # Initialize Ollama LLM
    llm = init_ollama()
    
    return len(texts)

def get_answer(question: str) -> Tuple[str, List[str]]:
    global retriever, llm
    
    if not retriever:
        return "Please upload a PDF first to initialize the knowledge base.", []
    
    # Get relevant documents
    docs = retriever.invoke(question)
    
    # Build citations
    citations = []
    for doc in docs:
        page = doc.metadata.get("page", "Unknown")
        content_snippet = doc.page_content[:150].replace("\n", " ") + "..."
        citations.append(f"Page {page}: {content_snippet}")
    
    context = format_docs(docs)
    
    if not llm:
        # If no LLM configured, just return the context as the answer
        return f"Based on the document, here's the relevant content:\n\n{context[:1500]}...", citations
    
    # Use Ollama to generate answer
    try:
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
        from langchain_core.runnables import RunnablePassthrough
        
        prompt = ChatPromptTemplate.from_template("""You are a helpful assistant. Answer the question based ONLY on the following context. 
Be concise and specific. Give a direct answer in 1-2 sentences maximum.
If the answer is not in the context, say "I cannot find this information in the document."

Context:
{context}

Question: {question}

Answer (be brief and direct):""")
        
        chain = (
            {"context": lambda x: context, "question": RunnablePassthrough()}
            | prompt
            | llm
            | StrOutputParser()
        )
        
        answer = chain.invoke(question)
        return answer, citations
    except Exception as e:
        print(f"LLM Error: {e}")
        # Fallback to showing raw context
        return f"Based on the document, here's the relevant content:\n\n{context[:1500]}...", citations
