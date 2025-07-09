import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import AuthForm from './components/AuthForm';
import UserProfile from './components/UserProfile';
import MeetingDetail from './components/MeetingDetail';
import MeetingMinutesGenerator from './components/MeetingMinutesGenerator';
import Chat from './components/Chat';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function NoteDetail({ note, onBack }) {
  if (!note) return null;
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    await supabase.from('notes').delete().eq('id', note.id);
    onBack();
  };
  return (
    <div className="p-6 max-w-2xl mx-auto relative">
      <button
        onClick={handleDelete}
        className="absolute top-4 right-4 mb-4 text-red-500 underline"
      >
        Delete
      </button>
      <button onClick={onBack} className="mb-4 text-blue-600 underline">Back to notes</button>
      <h2 className="text-2xl font-bold mb-2">Note</h2>
      {note.audio_file && (
        <div className="mb-2 text-blue-500 text-sm">Audio: {note.audio_file}</div>
      )}
      {typeof note.timestamp === 'number' && !isNaN(note.timestamp) && (
        <div className="mb-2 text-blue-500 text-sm">Timestamp: {note.timestamp.toFixed(1)}s</div>
      )}
      <div className="mb-2 text-gray-600">
        {note.created_at && new Date(note.created_at).toLocaleString()}
      </div>
      <div className="bg-gray-100 p-4 rounded whitespace-pre-line text-lg">
        {note.content}
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const currentSession = supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Delete handler for meetings
  const handleDeleteMeeting = async (meeting) => {
    if (!window.confirm('Are you sure you want to delete this meeting?')) return;
    await supabase.from('meetings').delete().eq('id', meeting.id);
    setSelectedMeeting(null);
  };

  if (!session) {
    return <AuthForm onAuth={setSession} />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <>
            <div style={{ display: showProfile ? 'none' : 'block' }}>
              <MeetingMinutesGenerator onViewProfile={() => setShowProfile(true)} user={session.user} />
            </div>
            <div style={{ display: showProfile ? 'block' : 'none' }}>
              {selectedNote ? (
                <NoteDetail note={selectedNote} onBack={() => setSelectedNote(null)} />
              ) : selectedMeeting ? (
                <MeetingDetail meeting={selectedMeeting} onBack={() => setSelectedMeeting(null)} user={session.user} onDelete={handleDeleteMeeting} />
              ) : (
                <UserProfile user={session.user} onSelectMeeting={setSelectedMeeting} onSelectNote={setSelectedNote} onBack={() => setShowProfile(false)} />
              )}
            </div>
          </>
        } />
        <Route path="/chat" element={<Chat />} />
      </Routes>
    </Router>
  );
}

export default App;
