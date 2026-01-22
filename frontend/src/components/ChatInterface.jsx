import React, { useState, useRef, useEffect } from 'react';
import { Send, FileUp, Loader2, FileText, Trash2, MessageSquare, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { cn } from '../lib/utils';

// Use relative URL when served from backend, or localhost for dev
const API_URL = window.location.port === '5173' ? 'http://localhost:8000' : '';

export function ChatInterface() {
    const [messages, setMessages] = useState([
        { role: 'bot', content: 'Hello! Upload one or more PDFs to start chatting. I\'ll remember our conversation context!' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState({});
    const [selectedFile, setSelectedFile] = useState(null); // For filtering
    const [sessionId] = useState(() => `session-${Date.now()}`);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Fetch uploaded files on mount
    useEffect(() => {
        fetchUploadedFiles();
    }, []);

    const fetchUploadedFiles = async () => {
        try {
            const response = await axios.get(`${API_URL}/files`);
            setUploadedFiles(response.data.files || {});
        } catch (error) {
            console.error('Failed to fetch files:', error);
        }
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setIsUploading(true);

        for (const file of files) {
            setMessages(prev => [...prev, {
                role: 'system',
                content: `Uploading ${file.name}...`
            }]);

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await axios.post(`${API_URL}/upload`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                setMessages(prev => [...prev, {
                    role: 'bot',
                    content: `✅ Processed **${response.data.filename}** (${response.data.chunks} chunks). Total files: ${response.data.total_files}. Ask me anything!`
                }]);

                await fetchUploadedFiles();
            } catch (error) {
                console.error('Upload failed:', error);
                setMessages(prev => [...prev, {
                    role: 'bot',
                    content: `❌ Failed to upload ${file.name}: ${error.response?.data?.detail || 'Unknown error'}`
                }]);
            }
        }

        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const response = await axios.post(`${API_URL}/chat`, {
                question: userMsg,
                session_id: sessionId,
                filter_filename: selectedFile,
                use_history: true
            });

            const { answer, citations, metadata } = response.data;

            setMessages(prev => [...prev, {
                role: 'bot',
                content: answer,
                citations,
                metadata
            }]);
        } catch (error) {
            console.error('Chat failed:', error);
            setMessages(prev => [...prev, {
                role: 'bot',
                content: 'Sorry, I encountered an error. Please try again.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearConversation = async () => {
        try {
            await axios.delete(`${API_URL}/conversation`);
            setMessages([{
                role: 'bot',
                content: 'Conversation cleared! I\'ve forgotten our previous chat. Ask me anything about your documents.'
            }]);
        } catch (error) {
            console.error('Failed to clear conversation:', error);
        }
    };

    const clearAllFiles = async () => {
        if (!confirm('This will delete all uploaded files. Are you sure?')) return;

        try {
            await axios.delete(`${API_URL}/files`);
            setUploadedFiles({});
            setSelectedFile(null);
            setMessages([{
                role: 'bot',
                content: 'All files cleared! Upload new PDFs to start fresh.'
            }]);
        } catch (error) {
            console.error('Failed to clear files:', error);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] max-w-5xl mx-auto p-4 gap-4">
            {/* File Pills */}
            {Object.keys(uploadedFiles).length > 0 && (
                <div className="flex flex-wrap gap-2 items-center bg-surface/50 p-3 rounded-lg border border-secondary/10">
                    <span className="text-xs text-secondary font-medium">Files:</span>
                    <button
                        onClick={() => setSelectedFile(null)}
                        className={cn(
                            "px-3 py-1 rounded-full text-xs transition-all",
                            selectedFile === null
                                ? "bg-primary text-white"
                                : "bg-secondary/10 text-secondary hover:bg-secondary/20"
                        )}
                    >
                        All ({Object.values(uploadedFiles).reduce((a, b) => a + b, 0)} chunks)
                    </button>
                    {Object.entries(uploadedFiles).map(([filename, chunks]) => (
                        <button
                            key={filename}
                            onClick={() => setSelectedFile(filename === selectedFile ? null : filename)}
                            className={cn(
                                "px-3 py-1 rounded-full text-xs transition-all flex items-center gap-1",
                                selectedFile === filename
                                    ? "bg-primary text-white"
                                    : "bg-secondary/10 text-secondary hover:bg-secondary/20"
                            )}
                        >
                            <FileText className="w-3 h-3" />
                            {filename.length > 20 ? filename.slice(0, 20) + '...' : filename}
                            <span className="opacity-70">({chunks})</span>
                        </button>
                    ))}
                    <button
                        onClick={clearAllFiles}
                        className="px-2 py-1 text-xs text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                        title="Clear all files"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                <AnimatePresence>
                    {messages.map((msg, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "flex gap-4 p-4 rounded-2xl max-w-[85%]",
                                msg.role === 'user'
                                    ? "ml-auto bg-primary text-white"
                                    : msg.role === 'system'
                                        ? "mx-auto bg-secondary/10 text-secondary text-sm"
                                        : "bg-surface border border-secondary/10 shadow-sm"
                            )}
                        >
                            <div className="flex-1">
                                <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                                    {msg.content}
                                </div>

                                {/* Metadata Badge */}
                                {msg.metadata && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {msg.metadata.confidence && (
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-xs",
                                                msg.metadata.confidence > 0.5
                                                    ? "bg-green-500/20 text-green-600"
                                                    : "bg-yellow-500/20 text-yellow-600"
                                            )}>
                                                Confidence: {(msg.metadata.confidence * 100).toFixed(0)}%
                                            </span>
                                        )}
                                        {msg.metadata.tokens_total && (
                                            <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-600">
                                                {msg.metadata.tokens_total} tokens
                                            </span>
                                        )}
                                        {msg.metadata.latency_ms && (
                                            <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-600">
                                                {msg.metadata.latency_ms}ms
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Citations - Source References */}
                                {msg.citations && msg.citations.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-secondary/20">
                                        <p className="text-xs font-semibold mb-2 opacity-70 flex items-center gap-1">
                                            📄 Sources:
                                        </p>
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {msg.citations.map((cite, i) => (
                                                <div key={i} className="text-xs bg-secondary/5 p-2 rounded border border-secondary/10 hover:bg-secondary/10 transition-colors">
                                                    {cite}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-2 items-center text-secondary text-sm p-4"
                    >
                        <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-surface p-4 rounded-xl border border-secondary/10 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                    <button
                        onClick={clearConversation}
                        className="text-xs text-secondary hover:text-primary transition-colors flex items-center gap-1"
                        title="Clear conversation memory"
                    >
                        <MessageSquare className="w-3 h-3" /> Clear Memory
                    </button>
                    {selectedFile && (
                        <span className="text-xs text-primary">
                            Filtering: {selectedFile}
                        </span>
                    )}
                </div>
                <form onSubmit={sendMessage} className="flex gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept=".pdf"
                        multiple
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 rounded-lg text-secondary hover:bg-secondary/10 transition-colors"
                        title="Upload PDF(s)"
                        disabled={isUploading}
                    >
                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                    </button>

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={selectedFile ? `Ask about ${selectedFile}...` : "Ask a question about your PDFs..."}
                        className="flex-1 bg-background border-none rounded-lg px-4 focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                    />

                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="p-3 bg-primary text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}
