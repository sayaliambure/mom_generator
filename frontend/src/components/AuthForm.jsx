import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function AuthForm({ onAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [meetings, setMeetings] = useState([]);
  const user = supabase.auth.getUser(); // or from session


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    let result;
    if (isSignUp) {
      result = await supabase.auth.signUp({ email, password });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }
    if (result.error) {
      setError(result.error.message);
    } else {
      onAuth(result.data.session);
    }
  };

  useEffect(() => {
    async function fetchMeetings() {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      setMeetings(data || []);
    }
    fetchMeetings();
  }, [user.id]);

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">{isSignUp ? 'Sign Up' : 'Login'}</h2>
      <input
        className="w-full border p-2 mb-2 rounded"
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
      />
      <input
        className="w-full border p-2 mb-2 rounded"
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
      />
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <button className="w-full bg-blue-600 text-white p-2 rounded mb-2" type="submit">
        {isSignUp ? 'Sign Up' : 'Login'}
      </button>
      <button
        type="button"
        className="w-full text-blue-600 underline"
        onClick={() => setIsSignUp(!isSignUp)}
      >
        {isSignUp ? 'Already have an account? Login' : 'No account? Sign Up'}
      </button>
    </form>
  );
} 