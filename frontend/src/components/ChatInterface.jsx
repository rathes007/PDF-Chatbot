import React, { useState, useRef, useEffect } from 'react';
import { Send, FileUp, Loader2, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';
import { cn } from '../lib/utils';

export function ChatInterface() {
    const [messages, setMessages] = useState([
        { role: 'bot', content: 'Hello! Upload a PDF to start chatting.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        setUploadStatus('Uploading...');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post('http://localhost:8000/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setUploadStatus(`Processed: ${response.data.filename} (${response.data.chunks} chunks)`);
            setMessages(prev => [...prev, { role: 'bot', content: `I've read ${file.name}. Ask me anything about it!` }]);
        } catch (error) {
            console.error('Upload failed:', error);
            setUploadStatus('Upload failed. Check backend.');
        } finally {
            setIsUploading(false);
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const response = await axios.post('http://localhost:8000/chat', {
                question: userMsg,
                session_id: 'default-session'
            });

            const { answer, citations } = response.data;
            setMessages(prev => [...prev, { role: 'bot', content: answer, citations }]);
        } catch (error) {
            console.error('Chat failed:', error);
            setMessages(prev => [...prev, { role: 'bot', content: 'Sorry, I encountered an error answering that.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] max-w-5xl mx-auto p-4 gap-4">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                {messages.map((msg, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                            "flex gap-4 p-4 rounded-2xl max-w-[85%]",
                            msg.role === 'user'
                                ? "ml-auto bg-primary text-white"
                                : "bg-surface border border-secondary/10 shadow-sm text-text"
                        )}
                    >
                        <div className="flex-1">
                            <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                                {msg.content}
                            </div>

                            {msg.citations && msg.citations.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-secondary/20">
                                    <p className="text-xs font-semibold mb-2 opacity-70">Sources:</p>
                                    <div className="space-y-2">
                                        {msg.citations.map((cite, i) => (
                                            <div key={i} className="text-xs bg-secondary/5 p-2 rounded border border-secondary/10">
                                                {cite}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
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
                {uploadStatus && (
                    <div className="text-xs text-secondary mb-2 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {uploadStatus}
                    </div>
                )}
                <form onSubmit={sendMessage} className="flex gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept=".pdf"
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 rounded-lg text-secondary hover:bg-secondary/10 transition-colors"
                        title="Upload PDF"
                        disabled={isUploading}
                    >
                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                    </button>

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question about your PDF..."
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
