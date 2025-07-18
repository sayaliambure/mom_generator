import React, { useState } from 'react';

const Chat = () => {
  const [chat, setChat] = useState([]); // {role: 'user'|'bot', text: string}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    setChat(prev => [...prev, { role: 'user', text: input }]);
    setLoading(true);

    try {
      const res = await fetch('http://127.0.0.1:5000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input })
      });

      const data = await res.json();

      const botMessage = data.answer;
      const sources = data.sources.map(src => 
        `📎 ${src.title || 'Untitled'} (Meeting ID: ${src.meeting_id})\n${src.snippet}`
      ).join('\n\n');

      setChat(current => [
        ...current,
        { role: 'bot', text: botMessage },
        ...(sources ? [{ role: 'bot', text: `🔍 Sources:\n\n${sources}` }] : [])
      ]);
    } catch (err) {
      setChat(current => [...current, { role: 'bot', text: 'Failed to get answer from server.' }]);
    }

    setLoading(false);
    setInput('');
  };

  const handleLoadMeetingData = async () => {
    setLoading(true);
    setChat(current => [...current, { role: 'bot', text: 'Loading and indexing meeting data...' }]);

    try {
      const res = await fetch('http://127.0.0.1:5000/build-index', { method: 'POST' });

      if (res.ok) {
        setChat(current => [...current, { role: 'bot', text: 'Meeting data successfully loaded and indexed.' }]);
      } else {
        throw new Error();
      }
    } catch (err) {
      setChat(current => [...current, { role: 'bot', text: 'Failed to load meeting data.' }]);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-50 py-8">
      <div className="w-full max-w-5xl h-[90vh] bg-white rounded shadow p-8 flex flex-col">
        <h2 className="text-2xl font-bold mb-4 text-center">Chat with Meeting Data</h2>
        <button
          onClick={handleLoadMeetingData}
          className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 self-center"
          disabled={loading}
        >
          Load Meeting Data
        </button>
        <div className="flex-1 overflow-y-auto mb-6 border rounded p-4 bg-gray-100" style={{ minHeight: 400, maxHeight: '60vh' }}>
          {chat.length === 0 ? (
            <div className="text-gray-400 text-center">No messages yet.</div>
          ) : (
            chat.map((msg, idx) => (
              <div key={idx} className={`mb-2 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`whitespace-pre-wrap px-3 py-2 rounded-lg max-w-2xl ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-900'}`}>
                  {msg.text}
                </div>
              </div>
            ))
          )}
          {loading && <div className="text-gray-400 text-center">Bot is typing...</div>}
        </div>
        <div className="flex gap-2 w-full">
          <input
            type="text"
            className="flex-1 border rounded p-3 text-lg"
            placeholder="Type your question..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            disabled={loading}
            style={{ minWidth: 0 }}
          />
          <button
            onClick={handleSend}
            className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 text-lg"
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
