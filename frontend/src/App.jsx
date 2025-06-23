import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import AuthForm from './components/AuthForm';
import UserProfile from './components/UserProfile';
import MeetingDetail from './components/MeetingDetail';
import MeetingMinutesGenerator from './components/MeetingMinutesGenerator';

function App() {
  const [session, setSession] = useState(null);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
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

  if (!session) {
    return <AuthForm onAuth={setSession} />;
  }

  if (showProfile) {
    return !selectedMeeting ? (
      <UserProfile user={session.user} onSelectMeeting={setSelectedMeeting} />
    ) : (
      <MeetingDetail meeting={selectedMeeting} onBack={() => setSelectedMeeting(null)} user={session.user} />
    );
  }

  return <MeetingMinutesGenerator onViewProfile={() => setShowProfile(true)} user={session.user} />;
}

export default App;
