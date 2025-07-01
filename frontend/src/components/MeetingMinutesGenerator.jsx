import React, { useState, useEffect, useRef } from "react";
import axios from 'axios';
import { ArrowDownTrayIcon, XMarkIcon, 
  MicrophoneIcon, StopIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";
import { supabase } from '../supabaseClient';
import { saveMeetingForUser } from '../utils/saveMeetingForUser';
import { saveNoteForUser } from '../utils/saveNoteForUser';
import jsPDF from 'jspdf';
import { uploadAudioFile } from '../utils/uploadAudioToSupabase';

const MeetingMinutesGenerator = ({ onViewProfile, user }) => {
  const [mode, setMode] = useState(""); // "upload" or "record"
  const [file, setFile] = useState(null);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meet_attendees, setMeetAttendees] = useState("");
  const [meetingAgenda, setAgenda] = useState("");
  const [transcript, setTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [intervalId, setIntervalId] = useState(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [summary, setSummary] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [meetingMinutes, setMeetingMinutes] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [generatingActions, setGeneratingActions] = useState(false);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [noteTimestamp, setNoteTimestamp] = useState(null);
  const [timestampedNotes, setTimestampedNotes] = useState([]); // {content, timestamp}
  const [editableTranscript, setEditableTranscript] = useState("");
  const [editableSummary, setEditableSummary] = useState("");
  const [editableActionItems, setEditableActionItems] = useState("");
  const [editableMeetingMinutes, setEditableMeetingMinutes] = useState("");
  const [identifySpeakers, setIdentifySpeakers] = useState(false);
  const [attendees, setAttendees] = useState([{ name: "", sample: null, sampleType: "upload" }]);
  const [audioURL, setAudioURL] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  const previousTranscriptRef = useRef(""); // Used to track the last live segment
  const seenLinesRef = useRef(new Set());

  const [sentimentResult, setSentimentResult] = useState("");
  const [scoringResult, setScoringResult] = useState("");
  const [analyzingSentiment, setAnalyzingSentiment] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [includeNotesInTranscript, setIncludeNotesInTranscript] = useState(false);

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);

  const recordingStartTimeRef = useRef(null);

  // Add a ref to queue notes taken during recording
  const queuedNotesRef = useRef([]);

  const [meetingId, setMeetingId] = useState(null);

  const [meetingNotes, setMeetingNotes] = useState([]);

  useEffect(() => {
    let interval;
    if (isLive) {
      interval = setInterval(fetchLiveTranscript, 2000);
    }
    return () => clearInterval(interval);
  }, [isLive]);

  useEffect(() => {
    setEditableTranscript(transcript || transcriptText || "");
  }, [transcript, transcriptText]);
  
  useEffect(() => {
    setEditableSummary(summary);
  }, [summary]);
  
  useEffect(() => {
    setEditableActionItems(actionItems);
  }, [actionItems]);

  useEffect(() => {
    setEditableMeetingMinutes(meetingMinutes);
  }, [meetingMinutes]);

  useEffect(() => {
    return () => {
      // Clean up any ongoing recording or polling
      if (intervalId) clearInterval(intervalId);
      if (isRecording) {
        stopMediaRecording();
      }
    };
  }, [intervalId, isRecording]);
  
  const fetchLiveTranscript = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/get_live_transcript");
      
      if (!res.ok) {
        const errorData = await res.json();
        console.error("Backend error:", errorData);
        
        // Automatically stop polling if transcription is inactive
        if (errorData.status === "error" && errorData.debug === "Stop flag is set") {
          console.log("Transcription stopped - ending live updates");
          stopLiveTranscript();
          setIsLive(false);
        }
        return;
      }
      
      const data = await res.json();
      
      if (data.status === "success" && data.text) {
        const newText = data.text.trim();
        if (newText && newText !== previousTranscriptRef.current) {
          setLiveTranscript(prev => prev + (prev ? "\n" : "") + newText);
          previousTranscriptRef.current = newText;
        }
      }
    } catch (err) {
      console.error("Failed to fetch live transcript:", err);
      stopLiveTranscript(); // Stop polling on error
    }
  };

  const startLiveTranscript = () => {
    if (!isRecording) {
      console.error("Cannot show live transcript - not recording");
      return;
    }
    
    if (intervalId) clearInterval(intervalId);
    setShowLive(true);
    
    // Start polling with error handling
    const id = setInterval(() => {
      if (isRecording) {
        fetchLiveTranscript();
      } else {
        clearInterval(id);
        setIntervalId(null);
      }
    }, 1000);
    
    setIntervalId(id);
  };

  const stopLiveTranscript = () => {
    setShowLive(false);
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
  };

  const getStoredTranscript = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:5000/get_transcript_file');
      setTranscriptText(await res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setAudioURL(URL.createObjectURL(selectedFile));  // Create temporary URL
    setMode("upload");
    // Save meeting as soon as audio is uploaded
    if (selectedFile && user) {
      const meetingData = {
        title: meetingTitle,
        date: meetingDate || null,
        attendees: meet_attendees,
        agenda: meetingAgenda,
      };
      try {
        const { id } = await saveMeetingForUser(user, meetingData, selectedFile);
        setMeetingId(id);
      } catch (error) {
        alert(error.message || JSON.stringify(error));
      }
    }
  };

  const startRecording = async () => {
    try {
      setAudioURL(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = audioChunks;
      streamRef.current = stream;
      mediaRecorder.start();
      setIsRecording(true);
      recordingStartTimeRef.current = Date.now();
    } catch (err) {
      alert('Error starting recording: ' + err.message);
    }
  };

  const fetchNotesForCurrentAudio = async (user, audioFileName) => {
    if (!user || !audioFileName) return [];
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .eq('audio_file', audioFileName)
      .order('timestamp', { ascending: true });
    return data || [];
  };

  const stopRecording = async () => {
    try {
      const mediaRecorder = mediaRecorderRef.current;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        await new Promise((resolve) => {
          mediaRecorder.onstop = resolve;
          mediaRecorder.stop();
        });
        setIsRecording(false);
        recordingStartTimeRef.current = null;
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const newFile = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
        setFile(newFile);
        setAudioURL(URL.createObjectURL(audioBlob));
        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        
        let newMeetingId = null;
        
        // Save meeting first
        if (user && newFile) {
          const meetingData = {
            title: meetingTitle,
            date: meetingDate || null,
            attendees: meet_attendees,
            agenda: meetingAgenda,
          };
          try {
            const { id } = await saveMeetingForUser(user, meetingData, newFile);
            newMeetingId = id;
            setMeetingId(id);
          } catch (error) {
            alert(error.message || JSON.stringify(error));
            return; // Don't proceed if meeting save fails
          }
        }
        
        // Fetch notes for this audio file and merge with local notes
        if (user && newFile.name) {
          const dbNotes = await fetchNotesForCurrentAudio(user, newFile.name);
          setTimestampedNotes((prev) => {
            // Merge local notes not in DB (by timestamp+content) with DB notes
            const merged = [...dbNotes];
            prev.forEach(localNote => {
              if (!merged.some(dbNote => dbNote.timestamp === localNote.timestamp && dbNote.content === localNote.content)) {
                merged.push(localNote);
              }
            });
            return merged;
          });
        }
        
        // Save all queued notes to DB with the new meeting ID
        if (user && newFile.name && queuedNotesRef.current.length > 0 && newMeetingId) {
          for (const note of queuedNotesRef.current) {
            try {
              await saveNoteForUser(user, note.content, newFile.name, note.timestamp, newMeetingId);
            } catch (err) {
              console.error('Error saving queued note:', err);
            }
          }
          queuedNotesRef.current = [];
        }
      }
    } catch (err) {
      alert('Error stopping recording: ' + (err.message || JSON.stringify(err)));
    }
  };

  const handleGenerate = async () => {
    if (mode === "upload" && !file) {
      alert("Please upload a file first.");
      return;
    }

    const formData = new FormData();
    if (file) formData.append("file", file);

    if (identifySpeakers) {
      formData.append("speaker_identification", "true");

      for (let i = 0; i < attendees.length; i++) {
        const att = attendees[i];
        if (!att.name || !att.sample) {
          alert(`Please provide name and sample for attendee ${i + 1}`);
          return;
        }
        formData.append(`attendee_names`, att.name);
        formData.append(`samples`, att.sample);
      }
    }

    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:5000/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setTranscript(data.transcript);
        try {
          // If no meetingId exists, create a basic meeting first
          if (!meetingId) {
            console.log('No meetingId found, creating new meeting first...');
            const basicMeetingData = {
              title: meetingTitle || 'Untitled Meeting',
              date: meetingDate || null,
              attendees: meet_attendees || '',
              agenda: meetingAgenda || '',
              audio_url: file ? await uploadAudioFile(user.id, file) : null,
            };
            const { id } = await saveMeetingForUser(user, basicMeetingData, null);
            setMeetingId(id);
            console.log('Created new meeting with ID:', id);
          }
          
          await upsertMeetingField('transcript', data.transcript);
          console.log('Transcript saved to database successfully');
        } catch (saveError) {
          console.error('Failed to save transcript to database:', saveError);
          alert(`Transcript generated but failed to save to database: ${saveError.message || JSON.stringify(saveError)}`);
        }
      } else {
        alert(data.error || "Transcription failed");
      }
    } catch (err) {
      alert("Server error");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const res = await axios.post("http://127.0.0.1:5000/summarize", {
        transcript: transcript || transcriptText,
      });
      setSummary(res.data.summary);
      await upsertMeetingField('summary', res.data.summary);
    } catch (err) {
      alert("Error generating summary");
    } finally {
      setGeneratingSummary(false);
    }
  };
  
  const handleGenerateActionItems = async () => {
    setGeneratingActions(true);
    try {
      const res = await axios.post("http://127.0.0.1:5000/action-items", {
        transcript: transcript || transcriptText,
      });
      setActionItems(res.data.action_items);
      await upsertMeetingField('action_items', res.data.action_items);
    } catch (err) {
      alert("Error generating action items");
    } finally {
      setGeneratingActions(false);
    }
  };

  const handleGenerateMinutes = async () => {
    setGeneratingMinutes(true);
    const fullTranscript = editableTranscript || transcript || transcriptText;
    if (!fullTranscript) {
      alert("Please generate a transcript first.");
      return;
    }
    const payload = {
      agenda: meetingAgenda, 
      transcript: {
        value: fullTranscript,
      }
    };
    if (meetingDate) {
      payload.transcript.date = meetingDate;
    }
    if (meetingTitle) {
      payload.transcript.title = meetingTitle;
    }
    if (meet_attendees) {
      payload.transcript.meet_attendees = meet_attendees; 
    }

    try {
      const res = await axios.post("http://127.00.0.1:5000/minutes-of-meeting", payload);
      setMeetingMinutes(res.data.minutes_of_meeting || "Minutes generated successfully!"); 
      await upsertMeetingField('minutes', res.data.minutes_of_meeting || "Minutes generated successfully!");
    } catch (err) {
      console.error("Error sending meeting minutes to API:", err);
      alert("Error generating meeting minutes. Please try again.");
    }
     finally {
      setGeneratingMinutes(false);
    }
  };

  const handleSentimentAnalysis = async () => {
    const fullTranscript = editableTranscript || transcript || transcriptText;
    if (!fullTranscript) {
      alert("Please generate a transcript first.");
      return;
    }
    setAnalyzingSentiment(true);
    try {
      const res = await axios.post("http://127.0.0.1:5000/sentiment", { transcript: fullTranscript });
      setSentimentResult(res.data.sentiment || res.data.result || JSON.stringify(res.data));
      await upsertMeetingField('sentiment', res.data.sentiment || res.data.result || JSON.stringify(res.data));
    } catch (err) {
      setSentimentResult("Error analyzing sentiment.");
      console.error(err);
    } finally {
      setAnalyzingSentiment(false);
    }
  };

  const handleScoring = async () => {
    const fullTranscript = editableTranscript || transcript || transcriptText;
    if (!fullTranscript) {
      alert("Please generate a transcript first.");
      return;
    }
    if (!meetingAgenda) {
      alert("Please enter the meeting agenda.");
      return;
    }
    setScoring(true);
    try {
      const res = await axios.post("http://127.0.0.1:5000/scoring-mechanism", { agenda: meetingAgenda, transcript: fullTranscript });
      setScoringResult(res.data.score || res.data.result || JSON.stringify(res.data));
      await upsertMeetingField('score', res.data.score || res.data.result || JSON.stringify(res.data));
    } catch (err) {
      setScoringResult("Error scoring meeting.");
      console.error(err);
    } finally {
      setScoring(false);
    }
  };

  const DownloadButton = ({ content, filename }) => {
    const handleDownload = () => {
      if (filename.endsWith('.pdf')) {
        const doc = new jsPDF();
        doc.setFontSize(10);
        // Split content into lines to avoid text overflow
        const lines = doc.splitTextToSize(content, 180);
        doc.text(lines, 10, 10);
        doc.save(filename);
      } else {
        const element = document.createElement("a");
        const file = new Blob([content], { type: "text/plain" });
        element.href = URL.createObjectURL(file);
        element.download = filename;
        document.body.appendChild(element); // required for Firefox
        element.click();
        document.body.removeChild(element);
      }
    };
  
    return (
      <button
        onClick={handleDownload}
        className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        <ArrowDownTrayIcon className="h-5 w-5" />
        {/* Download */}
      </button>
    );
  };
  
  // Helper function to clean up media recording
  const stopMediaRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  // Helper to insert notes into transcript
  function insertNotesIntoTranscript(transcript, notes) {
    let result = transcript;
    result += '\n\n';
    notes.forEach(note => {
      if (typeof note.timestamp === 'number' && !isNaN(note.timestamp)) {
        result += `[note taken by user at ${note.timestamp.toFixed(1)}s]: ${note.content}\n`;
      } else {
        result += `[note taken by user]: ${note.content}\n`;
      }
    });
    return result;
  }

  async function handleGenerateWithNotes(transcriptWithNotes) {
    setLoading(true);
    try {
      setTranscript(transcriptWithNotes);
    } finally {
      setLoading(false);
    }
  }

  // Helper to extract audio file name from URL
  function audioFileNameFromUrl(url) {
    if (!url) return null;
    try {
      return url.split('/').pop().split('?')[0];
    } catch {
      return null;
    }
  }

  // Fetch notes for the current meeting when meetingId changes
  useEffect(() => {
    async function fetchNotesForMeeting() {
      if (!meetingId) return;
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('timestamp', { ascending: true });
      if (!error) setMeetingNotes(data || []);
    }
    fetchNotesForMeeting();
  }, [meetingId]);

  // Add debug function to check user's meetings
  async function debugUserMeetings() {
    try {
      const { data: allMeetings, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user?.id);
      
      if (error) {
        return;
      }
      
      if (meetingId) {
        const targetMeeting = allMeetings?.find(m => m.id === meetingId);
      }
    } catch (err) {
      // Silent error
    }
  }

  // Add verification function to check if meeting was actually saved
  async function verifyMeetingSaved(meetingId) {
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId);
      
      if (error) {
        return false;
      }
      
      if (!data || data.length === 0) {
        return false;
      }
      
      if (data.length > 1) {
        // Multiple meetings found - this is a warning but not an error
      }
      
      return true;
    } catch (err) {
      return false;
    }
  }

  // Helper to save or update meeting with only the changed field
  async function upsertMeetingField(field, value, extra = {}) {
    if (!user) return;
    try {
      // Debug: check user's meetings first
      await debugUserMeetings();
      
      const meetingData = { id: meetingId, ...extra };
      meetingData[field] = value;
      // Always include latest form values if present
      if (meetingTitle) meetingData.title = meetingTitle;
      if (meetingDate) meetingData.date = meetingDate || null;
      if (meet_attendees) meetingData.attendees = meet_attendees;
      if (meetingAgenda) meetingData.agenda = meetingAgenda;
      
      const { id } = await saveMeetingForUser(user, meetingData, null);
      if (!meetingId) {
        setMeetingId(id);
      }
      
      // Verify the meeting was actually saved
      const verified = await verifyMeetingSaved(id);
      if (!verified) {
        throw new Error(`Failed to verify ${field} was saved to database`);
      }
    } catch (error) {
      alert(`Error saving ${field} to database: ${error.message || JSON.stringify(error)}`);
    }
  }

  // Add useEffect hooks to upsert meeting fields when they change
  useEffect(() => {
    if (transcript) upsertMeetingField('transcript', transcript);
    // eslint-disable-next-line
  }, [transcript]);

  useEffect(() => {
    if (summary) upsertMeetingField('summary', summary);
    // eslint-disable-next-line
  }, [summary]);

  useEffect(() => {
    if (meetingMinutes) upsertMeetingField('minutes', meetingMinutes);
    // eslint-disable-next-line
  }, [meetingMinutes]);

  useEffect(() => {
    if (sentimentResult) upsertMeetingField('sentiment', sentimentResult);
    // eslint-disable-next-line
  }, [sentimentResult]);

  useEffect(() => {
    if (scoringResult) upsertMeetingField('score', scoringResult);
    // eslint-disable-next-line
  }, [scoringResult]);

  // Helper to convert audio blob to WAV format
  async function convertToWav(audioBlob) {
    return new Promise((resolve) => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const fileReader = new FileReader();
      
      fileReader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Create WAV file
          const wavBlob = audioBufferToWav(audioBuffer);
          resolve(wavBlob);
        } catch (error) {
          console.error('Error converting to WAV:', error);
          // Fallback: return original blob if conversion fails
          resolve(audioBlob);
        }
      };
      
      fileReader.readAsArrayBuffer(audioBlob);
    });
  }

  // Helper to convert AudioBuffer to WAV blob
  function audioBufferToWav(buffer) {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  return (
    <div className="relative min-h-screen bg-gray-100">
      <button
        onClick={handleLogout}
        className="absolute top-4 right-2 bg-gray-800 text-white px-4 py-2 rounded shadow"
      >
        Logout
      </button>
      {onViewProfile && (
        <button
          onClick={onViewProfile}
          className="absolute top-4 right-28 bg-gray-800 text-white px-4 py-2 rounded shadow"
        >
          View Profile
        </button>
      )}
      <div className="max-w-5xl mx-auto mt-10 p-6 bg-white rounded-lg shadow-md relative">
        <h1 className="text-3xl font-bold text-center mb-4">Meeting Minutes Generator</h1>
        <p className="text-center text-gray-500 mb-8">Upload or record a meeting to generate transcripts and minutes</p>

        <div className="flex justify-center gap-4 mb-6">
          <button onClick={() => setMode("upload")} className={`px-4 py-2 rounded ${mode === "upload" ? "bg-black text-white" : "bg-gray-200"}`}>
            Upload Audio File
          </button>
          <button onClick={() => setMode("record")} className={`px-4 py-2 rounded ${mode === "record" ? "bg-black text-white" : "bg-gray-200"}`}>
            Record Meeting
          </button>
        </div>

        {mode === "upload" && (
          <>
            <div className="border rounded-lg p-6 border-dashed border-gray-300 bg-gray-50 mb-6 text-center">
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={handleFileChange}
                className="hidden"
                id="fileInput"
              />
              <label htmlFor="fileInput" className="cursor-pointer text-blue-600 font-semibold">
                {file ? file.name : "Choose File"}
              </label>
            </div>
            {file && audioURL && (
              <div className="mt-4 w-full">
                <p className="text-gray-600 mb-2">Audio Preview:</p>
                <audio controls src={audioURL} className="w-full" />
                {/* Note markers below audio preview */}
                {timestampedNotes.length > 0 && (
                  <div className="relative w-full h-6 mt-1 flex items-center">
                    {timestampedNotes.map((note, idx) => {
                      const audio = document.querySelector('audio');
                      const duration = audio ? audio.duration : 1;
                      const percent = (typeof note.timestamp === 'number' && !isNaN(note.timestamp) && duration)
                        ? (note.timestamp / duration) * 100 : 0;
                      // Only render pointer if timestamp is a valid number
                      if (typeof note.timestamp !== 'number' || isNaN(note.timestamp)) return null;
                      return (
                        <button
                          key={idx}
                          style={{ left: `${percent}%`, transform: 'translateX(-50%)', position: 'absolute', top: 0 }}
                          className="w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow hover:bg-blue-700 cursor-pointer pointer-events-auto"
                          title={`Note at ${note.timestamp.toFixed(1)}s`}
                          onClick={() => {
                            setSelectedNote(note);
                            setShowNoteModal(true);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {/* Identify Speakers UI below upload controls */}
            <div className="mb-4">
              <label className="inline-flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={identifySpeakers}
                  onChange={(e) => setIdentifySpeakers(e.target.checked)}
                />
                <span>Identify Speakers</span>
              </label>
            </div>
            {identifySpeakers && (
              <div className="space-y-4 mb-6">
                {attendees.map((attendee, index) => (
                  <div key={index} className="border p-4 rounded-md shadow-sm">
                    <label className="block mb-1 font-medium text-sm">Attendee {index + 1}</label>
                    <input
                      type="text"
                      placeholder="Name"
                      value={attendee.name}
                      onChange={(e) => {
                        const updated = [...attendees];
                        updated[index].name = e.target.value;
                        setAttendees(updated);
                      }}
                      className="w-full border rounded p-2 mb-2"
                    />
                    {/* Sample Type Selection */}
                    <div className="mb-2">
                      <label className="block text-sm font-medium mb-1">Sample Type:</label>
                      <div className="flex gap-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`sampleType-${index}`}
                            value="upload"
                            checked={attendee.sampleType === "upload"}
                            onChange={(e) => {
                              const updated = [...attendees];
                              updated[index].sampleType = e.target.value;
                              updated[index].sample = null;
                              setAttendees(updated);
                            }}
                            className="mr-2"
                          />
                          Upload Audio File
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`sampleType-${index}`}
                            value="record"
                            checked={attendee.sampleType === "record"}
                            onChange={(e) => {
                              const updated = [...attendees];
                              updated[index].sampleType = e.target.value;
                              updated[index].sample = null;
                              setAttendees(updated);
                            }}
                            className="mr-2"
                          />
                          Record Audio
                        </label>
                      </div>
                    </div>
                    {/* Upload Option */}
                    {attendee.sampleType === "upload" && (
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => {
                          const updated = [...attendees];
                          updated[index].sample = e.target.files[0];
                          setAttendees(updated);
                        }}
                        className="w-full"
                      />
                    )}
                    {/* Record Option */}
                    {attendee.sampleType === "record" && (
                      <div className="space-y-2">
                        <button
                          onClick={async () => {
                            try {
                              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                              const mediaRecorder = new MediaRecorder(stream);
                              const audioChunks = [];
                              mediaRecorder.ondataavailable = (event) => {
                                if (event.data.size > 0) {
                                  audioChunks.push(event.data);
                                }
                              };
                              mediaRecorder.onstop = async () => {
                                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                                // Convert to WAV format
                                const wavBlob = await convertToWav(audioBlob);
                                // Create file with attendee name
                                const fileName = `${attendee.name || `attendee_${index + 1}`}.wav`;
                                const audioFile = new File([wavBlob], fileName, { type: 'audio/wav' });
                                const updated = [...attendees];
                                updated[index].sample = audioFile;
                                setAttendees(updated);
                                // Clean up stream
                                stream.getTracks().forEach(track => track.stop());
                              };
                              mediaRecorder.start();
                              // Update button state
                              const updated = [...attendees];
                              updated[index].isRecording = true;
                              setAttendees(updated);
                              // Stop recording after 5 seconds (or you can add a stop button)
                              setTimeout(() => {
                                if (mediaRecorder.state === 'recording') {
                                  mediaRecorder.stop();
                                  const updated = [...attendees];
                                  updated[index].isRecording = false;
                                  setAttendees(updated);
                                }
                              }, 5000);
                            } catch (err) {
                              alert('Error starting recording: ' + err.message);
                            }
                          }}
                          disabled={attendee.isRecording}
                          className={`px-4 py-2 rounded text-white ${
                            attendee.isRecording 
                              ? 'bg-gray-400' 
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {attendee.isRecording ? 'Recording...' : 'Start Recording (5s)'}
                        </button>
                        {attendee.sample && (
                          <div className="text-sm text-green-600">
                            ✓ Audio recorded: {attendee.sample.name}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setAttendees([...attendees, { name: "", sample: null, sampleType: "upload" }]);
                  }}
                  className="text-sm text-blue-600 mt-2 underline"
                >
                  + Add Attendee
                </button>
              </div>
            )}
          </>
        )}

        {mode === "record" && (
          <>
            {/* Main meeting recording controls */}
            <div className="flex flex-col items-center mb-6 space-y-4 w-full">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
                >
                  <MicrophoneIcon className="h-5 w-5" />
                  Start Recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition"
                >
                  <StopIcon className="h-5 w-5" />
                  Stop Recording
                </button>
              )}
              {audioURL && (
                <div className="mt-4 w-full">
                  <p className="text-gray-600 mb-2">Recorded Audio:</p>
                  <audio controls src={audioURL} className="w-full" />
                  {/* Note markers below audio preview */}
                  {timestampedNotes.length > 0 && (
                    <div className="relative w-full h-6 mt-1 flex items-center">
                      {timestampedNotes.map((note, idx) => {
                        const audio = document.querySelector('audio');
                        const duration = audio ? audio.duration : 1;
                        const percent = (typeof note.timestamp === 'number' && !isNaN(note.timestamp) && duration)
                          ? (note.timestamp / duration) * 100 : 0;
                        if (typeof note.timestamp !== 'number' || isNaN(note.timestamp)) return null;
                        return (
                          <button
                            key={idx}
                            style={{ left: `${percent}%`, transform: 'translateX(-50%)', position: 'absolute', top: 0 }}
                            className="w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow hover:bg-blue-700 cursor-pointer pointer-events-auto"
                            title={`Note at ${note.timestamp.toFixed(1)}s`}
                            onClick={() => {
                              setSelectedNote(note);
                              setShowNoteModal(true);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Identify Speakers UI below recording controls */}
            <div className="mb-4">
              <label className="inline-flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={identifySpeakers}
                  onChange={(e) => setIdentifySpeakers(e.target.checked)}
                />
                <span>Identify Speakers</span>
              </label>
            </div>
            {identifySpeakers && (
              <div className="space-y-4 mb-6">
                {attendees.map((attendee, index) => (
                  <div key={index} className="border p-4 rounded-md shadow-sm">
                    <label className="block mb-1 font-medium text-sm">Attendee {index + 1}</label>
                    <input
                      type="text"
                      placeholder="Name"
                      value={attendee.name}
                      onChange={(e) => {
                        const updated = [...attendees];
                        updated[index].name = e.target.value;
                        setAttendees(updated);
                      }}
                      className="w-full border rounded p-2 mb-2"
                    />
                    {/* Sample Type Selection */}
                    <div className="mb-2">
                      <label className="block text-sm font-medium mb-1">Sample Type:</label>
                      <div className="flex gap-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`sampleType-${index}`}
                            value="upload"
                            checked={attendee.sampleType === "upload"}
                            onChange={(e) => {
                              const updated = [...attendees];
                              updated[index].sampleType = e.target.value;
                              updated[index].sample = null;
                              setAttendees(updated);
                            }}
                            className="mr-2"
                          />
                          Upload Audio File
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`sampleType-${index}`}
                            value="record"
                            checked={attendee.sampleType === "record"}
                            onChange={(e) => {
                              const updated = [...attendees];
                              updated[index].sampleType = e.target.value;
                              updated[index].sample = null;
                              setAttendees(updated);
                            }}
                            className="mr-2"
                          />
                          Record Audio
                        </label>
                      </div>
                    </div>
                    {/* Upload Option */}
                    {attendee.sampleType === "upload" && (
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => {
                          const updated = [...attendees];
                          updated[index].sample = e.target.files[0];
                          setAttendees(updated);
                        }}
                        className="w-full"
                      />
                    )}
                    {/* Record Option */}
                    {attendee.sampleType === "record" && (
                      <div className="space-y-2">
                        <button
                          onClick={async () => {
                            try {
                              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                              const mediaRecorder = new MediaRecorder(stream);
                              const audioChunks = [];
                              mediaRecorder.ondataavailable = (event) => {
                                if (event.data.size > 0) {
                                  audioChunks.push(event.data);
                                }
                              };
                              mediaRecorder.onstop = async () => {
                                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                                // Convert to WAV format
                                const wavBlob = await convertToWav(audioBlob);
                                // Create file with attendee name
                                const fileName = `${attendee.name || `attendee_${index + 1}`}.wav`;
                                const audioFile = new File([wavBlob], fileName, { type: 'audio/wav' });
                                const updated = [...attendees];
                                updated[index].sample = audioFile;
                                setAttendees(updated);
                                // Clean up stream
                                stream.getTracks().forEach(track => track.stop());
                              };
                              mediaRecorder.start();
                              // Update button state
                              const updated = [...attendees];
                              updated[index].isRecording = true;
                              setAttendees(updated);
                              // Stop recording after 5 seconds (or you can add a stop button)
                              setTimeout(() => {
                                if (mediaRecorder.state === 'recording') {
                                  mediaRecorder.stop();
                                  const updated = [...attendees];
                                  updated[index].isRecording = false;
                                  setAttendees(updated);
                                }
                              }, 5000);
                            } catch (err) {
                              alert('Error starting recording: ' + err.message);
                            }
                          }}
                          disabled={attendee.isRecording}
                          className={`px-4 py-2 rounded text-white ${
                            attendee.isRecording 
                              ? 'bg-gray-400' 
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {attendee.isRecording ? 'Recording...' : 'Start Recording (5s)'}
                        </button>
                        {attendee.sample && (
                          <div className="text-sm text-green-600">
                            ✓ Audio recorded: {attendee.sample.name}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setAttendees([...attendees, { name: "", sample: null, sampleType: "upload" }]);
                  }}
                  className="text-sm text-blue-600 mt-2 underline"
                >
                  + Add Attendee
                </button>
              </div>
            )}
          </>
        )}

        <input
          type="text"
          placeholder="Meeting Title"
          value={meetingTitle}
          onChange={(e) => setMeetingTitle(e.target.value)}
          className="w-full border rounded p-2 mb-4"
        />
        <input
          type="date"
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.target.value)}
          className="w-full border rounded p-2 mb-4"
        />
        <textarea
          placeholder="Attendees (e.g. John Doe, Jane Smith)"
          value={meet_attendees}
          onChange={(e) => setMeetAttendees(e.target.value)}
          className="w-full border rounded p-2 mb-4"
          rows={1}
        />
        <textarea
          placeholder="Meeting Agenda"
          value={meetingAgenda}
          onChange={(e) => setAgenda(e.target.value)}
          className="w-full border rounded p-2 mb-4"
          rows={3}
        />

        {/* Include notes in transcript checkbox */}
        <div className="flex items-center mb-2">
          <input
            type="checkbox"
            id="includeNotesInTranscript"
            checked={includeNotesInTranscript}
            onChange={e => setIncludeNotesInTranscript(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="includeNotesInTranscript" className="text-md">Include notes in transcript</label>
        </div>
        {mode === "upload" ? (
          <button
            onClick={async () => {
              if (!file) {
                alert("Please upload a file first.");
                return;
              }
              setLoading(true);
              const formData = new FormData();
              formData.append("file", file);
              formData.append("mode", "upload");
              if (identifySpeakers) {
                formData.append("speaker_identification", "true");
                attendees.forEach((attendee) => {
                  formData.append("attendee_names", attendee.name);
                  if (attendee.sample) {
                    formData.append("samples", attendee.sample);
                  }
                });
              }
              try {
                const res = await fetch("http://127.0.0.1:5000/transcribe", {
                  method: "POST",
                  body: formData,
                });
                const data = await res.json();
                let transcriptResult = data.transcript;
                if (includeNotesInTranscript && transcriptResult && timestampedNotes.length > 0) {
                  transcriptResult = insertNotesIntoTranscript(transcriptResult, timestampedNotes);
                }
                if (res.ok) {
                  setTranscript(transcriptResult);
                  await upsertMeetingField('transcript', transcriptResult);
                } else {
                  alert(data.error || "Transcription failed");
                }
              } catch (err) {
                alert("Server error");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className={`w-full p-3 text-white font-bold rounded ${loading ? "bg-gray-400" : "bg-black hover:bg-gray-800"}`}
          >
            {loading ? "Generating..." : "Generate Transcript"}
          </button>
        ) : (
          <button
            onClick={async () => {
              if (!file) {
                alert("Please record audio first.");
                return;
              }
              setLoading(true);
              const formData = new FormData();
              formData.append("file", file);
              formData.append("mode", "record");
              if (identifySpeakers) {
                formData.append("speaker_identification", "true");
                attendees.forEach((attendee) => {
                  formData.append("attendee_names", attendee.name);
                  if (attendee.sample) {
                    formData.append("samples", attendee.sample);
                  }
                });
              }
              try {
                const res = await fetch("http://127.0.0.1:5000/transcribe", {
                  method: "POST",
                  body: formData,
                });
                const data = await res.json();
                let transcriptResult = data.transcript;
                if (includeNotesInTranscript && transcriptResult && timestampedNotes.length > 0) {
                  transcriptResult = insertNotesIntoTranscript(transcriptResult, timestampedNotes);
                }
                if (res.ok) {
                  setTranscript(transcriptResult);
                  await upsertMeetingField('transcript', transcriptResult);
                } else {
                  alert(data.error || "Transcription failed");
                }
              } catch (err) {
                alert("Server error");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className={`w-full p-3 text-white font-bold rounded ${loading ? "bg-gray-400" : "bg-black hover:bg-gray-800"}`}
          >
            {loading ? "Generating..." : "Get Transcript"}
          </button>
        )}

        {(editableTranscript || transcriptText) && (
          <div className="mt-8 bg-gray-100 p-4 rounded">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Meeting Transcript</h2>
              <div className="mt-2">
                <DownloadButton content={transcript} filename="transcript.pdf" />
              </div>
            </div>
            <textarea
              value={editableTranscript}
              onChange={(e) => setEditableTranscript(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap"
              rows={10}
            />
          </div>
        )}

        {(transcript || transcriptText) && (
          <div className="mt-6 flex gap-4">
            <button
              onClick={handleGenerateSummary}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={generatingSummary}
            >
              {generatingSummary ? "Generating Summary..." : "Generate Summary"}
            </button>

            <button
              onClick={handleGenerateActionItems}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={generatingActions}
            >
              {generatingActions ? "Generating Action Items..." : "Generate Action Items"}
            </button>

            <button
              onClick={handleGenerateMinutes}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={generatingMinutes}
            >
              {generatingMinutes ? "Generating Minutes..." : "Generate Minutes"}
            </button>
            <button
              onClick={handleSentimentAnalysis}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={analyzingSentiment}
            >
              {analyzingSentiment ? "Analyzing Sentiment..." : "Sentiment Analysis"}
            </button>
            <button
              onClick={handleScoring}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={scoring}
            >
              {scoring ? "Scoring..." : "Scoring Mechanism"}
            </button>
          </div>
        )}

        {summary && (
          <div className="mt-6 bg-gray-50 p-4 border rounded">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Summary</h2>
              <div className="mt-2">
                <DownloadButton content={summary} filename="summary.pdf" />
              </div>
            </div>
            <textarea
              value={editableSummary}
              onChange={(e) => setEditableSummary(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap"
              rows={6}
            />
          </div>
        )}

        {actionItems && (
          <div className="mt-6 bg-gray-50 p-4 border rounded">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Action Items</h2>
              <div className="mt-2">
                <DownloadButton content={actionItems} filename="action_items.pdf" />
              </div>
            </div>
            <textarea
              value={editableActionItems}
              onChange={(e) => setEditableActionItems(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap"
              rows={6}
            />
          </div>
        )}

        {meetingMinutes && (
          <div className="mt-6 bg-gray-50 p-4 border rounded">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Meeting Minutes</h2>
              <div className="mt-2">
                <DownloadButton content={editableMeetingMinutes} filename="meeting_minutes.pdf" />
              </div>
            </div>
            <textarea
              value={editableMeetingMinutes}
              onChange={(e) => setEditableMeetingMinutes(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap"
              rows={15}
            />
          </div>
        )}

        {sentimentResult && (
          <div className="mt-6 bg-gray-50 p-4 border rounded">
            <h2 className="text-xl font-semibold mb-2">Sentiment Analysis</h2>
            <textarea
              value={sentimentResult}
              readOnly
              className="w-full p-2 border rounded whitespace-pre-wrap"
              rows={4}
            />
          </div>
        )}
        {scoringResult && (
          <div className="mt-6 bg-gray-50 p-4 border rounded">
            <h2 className="text-xl font-semibold mb-2">Scoring Mechanism</h2>
            <textarea
              value={scoringResult}
              readOnly
              className="w-full p-2 border rounded whitespace-pre-wrap"
              rows={4}
            />
          </div>
        )}

        <button
          onClick={() => {
            let ts = null;
            if (isRecording && recordingStartTimeRef.current) {
              ts = (Date.now() - recordingStartTimeRef.current) / 1000;
            } else {
              const audio = document.querySelector('audio');
              if (audio && !audio.paused) {
                ts = audio.currentTime;
              }
            }
            setNoteTimestamp(ts);
            setNoteInput('');
            setShowNotes(true);
          }}
          className="fixed bottom-10 right-10 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 4h6m-3 0v16M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          Take Notes
        </button>

        {showNotes && (
          <div className="fixed bottom-24 right-8 w-96 bg-white shadow-lg rounded-lg p-4 z-50">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">Quick Notes</h2>
              <button onClick={() => setShowNotes(false)}>
                <XMarkIcon className="h-5 w-5 text-gray-500 hover:text-gray-700" />
              </button>
            </div>
            {noteTimestamp !== null && (
              <div className="mb-2 text-xs text-gray-500">Timestamp: {noteTimestamp.toFixed(1)}s</div>
            )}
            <textarea
              className="w-full h-32 p-2 border border-gray-300 rounded"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Type your notes here..."
            />
            <button
              onClick={async () => {
                if (!user) { alert('You must be logged in to save notes.'); return; }
                let ts = noteTimestamp;
                let audioFileName = null;
                if (isRecording && file) {
                  audioFileName = file.name;
                } else {
                  const audio = document.querySelector('audio');
                  if (audio && !audio.paused) {
                    audioFileName = file?.name || audioFileNameFromUrl(audioURL);
                  }
                }
                setTimestampedNotes((prev) => [...prev, { content: noteInput, timestamp: ts }]);
                if (isRecording) {
                  // Queue the note for saving after recording stops
                  queuedNotesRef.current.push({ content: noteInput, timestamp: ts });
                  setShowNotes(false);
                  setNoteInput('');
                  setNoteTimestamp(null);
                  return;
                }
                // If not recording, save immediately
                try {
                  await saveNoteForUser(user, noteInput, audioFileName, ts, meetingId);
                  alert('Notes saved!');
                  setShowNotes(false);
                  setNoteInput('');
                  setNoteTimestamp(null);
                } catch (err) {
                  alert('Error saving notes: ' + (err.message || JSON.stringify(err)));
                }
              }}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded w-full disabled:opacity-50"
              disabled={!noteInput.trim() || !user}
            >
              Save Notes
            </button>
          </div>
        )}

        {/* Note modal for pointer click */}
        {showNoteModal && selectedNote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full relative">
              <button
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-xl"
                onClick={() => setShowNoteModal(false)}
                aria-label="Close"
              >
                &times;
              </button>
              {typeof selectedNote.timestamp === 'number' && !isNaN(selectedNote.timestamp) && (
                <div className="mb-2 text-xs text-gray-500">Timestamp: {selectedNote.timestamp.toFixed(1)}s</div>
              )}
              <div className="text-lg whitespace-pre-line">{selectedNote.content}</div>
            </div>
          </div>
        )}

        {/* Display meeting notes section */}
        {meetingNotes.length > 0 && (
          <div className="mt-6 bg-gray-50 p-4 border rounded">
            <h2 className="text-xl font-semibold mb-2">Meeting Notes</h2>
            <ul>
              {meetingNotes.map((note, idx) => (
                <li key={note.id || idx} className="mb-2">
                  <span className="text-xs text-gray-500 mr-2">
                    {typeof note.timestamp === 'number' && !isNaN(note.timestamp) ? `${note.timestamp.toFixed(1)}s:` : ''}
                  </span>
                  <span>{note.content}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingMinutesGenerator;
