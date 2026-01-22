import React from 'react';
import { Moon, Sun, Activity, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';

export function Header({ theme, toggleTheme, currentView, setView }) {
    return (
        <header className="flex items-center justify-between px-6 py-4 bg-surface border-b border-secondary/10 shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                    PDF RAG Chat
                </h1>
            </div>

            <div className="flex items-center gap-4">
                <nav className="flex bg-secondary/10 p-1 rounded-lg">
                    <button
                        onClick={() => setView('chat')}
                        className={cn(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
                            currentView === 'chat'
                                ? "bg-surface text-primary shadow-sm"
                                : "text-secondary hover:text-text"
                        )}
                    >
                        Chat
                    </button>
                    <button
                        onClick={() => setView('dashboard')}
                        className={cn(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2",
                            currentView === 'dashboard'
                                ? "bg-surface text-primary shadow-sm"
                                : "text-secondary hover:text-text"
                        )}
                    >
                        <Activity className="w-4 h-4" />
                        Dashboard
                    </button>
                </nav>

                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-full hover:bg-secondary/10 text-secondary hover:text-primary transition-colors"
                    aria-label="Toggle Theme"
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
            </div>
        </header>
    );
}
