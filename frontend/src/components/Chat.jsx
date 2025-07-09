import React, { useState } from 'react';

const Chat = () => {
  const [chat, setChat] = useState([]); // {role: 'user'|'bot', text: string}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    setChat([...chat, { role: 'user', text: input }]);
    setLoading(true);
    // Simulate bot response (replace with real API call)
    setTimeout(() => {
      setChat(current => [...current, { role: 'bot', text: `Echo: ${input}` }]);
      setLoading(false);
    }, 800);
    setInput('');
  };

  const handleLoadMeetingData = () => {
    setChat(current => [...current, { role: 'bot', text: 'Meeting data loaded (placeholder).' }]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-50 py-8">
      <div className="w-full max-w-xl bg-white rounded shadow p-6 flex flex-col">
        <h2 className="text-2xl font-bold mb-4 text-center">Chat with Meeting Data</h2>
        <button
          onClick={handleLoadMeetingData}
          className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 self-center"
        >
          Load Meeting Data
        </button>
        <div className="flex-1 overflow-y-auto mb-4 border rounded p-2 bg-gray-100" style={{ minHeight: 200, maxHeight: 300 }}>
          {chat.length === 0 ? (
            <div className="text-gray-400 text-center">No messages yet.</div>
          ) : (
            chat.map((msg, idx) => (
              <div key={idx} className={`mb-2 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`px-3 py-2 rounded-lg max-w-xs ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-900'}`}>
                  {msg.text}
                </div>
              </div>
            ))
          )}
          {loading && <div className="text-gray-400 text-center">Bot is typing...</div>}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 border rounded p-2"
            placeholder="Type your question..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={loading || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat; 