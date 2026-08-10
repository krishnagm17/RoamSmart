import React, { useState } from 'react';
import { Bot, X, MessageSquare, Send, Minus } from 'lucide-react';
import './FloatingChatbot.css';

export default function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(true); // Open by default based on image

  if (!isOpen) {
    return (
      <button 
        className="chatbot-trigger animate-fade-in"
        onClick={() => setIsOpen(true)}
      >
        <MessageSquare size={24} />
      </button>
    );
  }

  return (
    <div className="chatbot-window glass-card animate-fade-in">
      <div className="chatbot-header">
        <div className="chatbot-title">
          <span>AI Assistant</span>
          <div className="online-indicator">
            <span className="dot"></span> Online
          </div>
        </div>
        <div className="chatbot-actions">
          <button className="header-action-btn"><Minus size={16} /></button>
          <button className="header-action-btn" onClick={() => setIsOpen(false)}><X size={16} /></button>
        </div>
      </div>
      
      <div className="chatbot-messages">
        <div className="message bot-message">
          <img src="https://i.pravatar.cc/150?img=47" alt="Profile" className="message-avatar" />
          <div className="message-bubble">
            <strong>Hi Ananya! 👋</strong><br/>
            How can I help you plan your perfect trip today?
          </div>
        </div>
        
        <div className="quick-suggestions">
          <button className="suggestion-btn"><Bot size={14}/> Plan a trip for me</button>
          <button className="suggestion-btn"><Bot size={14}/> Suggest nearby places</button>
          <button className="suggestion-btn"><Bot size={14}/> Predict crowd levels</button>
          <button className="suggestion-btn"><Bot size={14}/> Optimize my budget</button>
        </div>
      </div>
      
      <div className="chatbot-input">
        <input type="text" placeholder="Type your message..." />
        <button className="send-btn">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
