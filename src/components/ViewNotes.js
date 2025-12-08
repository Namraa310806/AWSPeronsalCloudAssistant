import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './ViewNotes.css';
import { apiFetch } from '../api';

function ViewNotes() {
  const [notes, setNotes] = useState([]);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [summary, setSummary] = useState('');
  const [summaryMeta, setSummaryMeta] = useState(null);
  const [loadingFiles, setLoadingFiles] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadNotesAndFiles();
  }, []);

  const loadNotesAndFiles = async () => {
    setIsLoading(true);
    try {
      // Load notes and files in parallel
      const [notesResponse, filesResponse] = await Promise.all([
        apiFetch('/notes'),
        apiFetch('/files')
      ]);

      const notes = notesResponse.ok ? await notesResponse.json() : [];
      const files = filesResponse.ok ? await filesResponse.json() : [];
      
      console.log('Notes loaded:', notes);
      console.log('Files loaded:', files);
      
      setNotes(notes || []);
      setFiles(files || []);
      setIsLoading(false);

    } catch (error) {
      console.error('Error loading data:', error);
      setMessage('Error loading notes and files. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSummarizeFile = async (file) => {
    setLoadingFiles(prev => ({ ...prev, [`summarize-${file.id}`]: true }));
    setSelectedItem(file);
    setSummary('');
    setSummaryMeta(null);
    setMessage('');

    try {
      console.log('Summarizing file:', file);
      
      const response = await apiFetch('/summarize', {
        method: 'POST',
        body: JSON.stringify({
          type: 'file',
          fileKey: file.key,
          fileName: file.name,
          content: `File: ${file.name} (Size: ${file.size} bytes)`
        })
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('File summarized result:', result);
      
      if (response.ok && result.summary) {
        // Clean up the summary text
        let cleanSummary = result.summary;
        if (typeof cleanSummary === 'string') {
          cleanSummary = cleanSummary
            .replace(/[^\x20-\x7E\n\r\t]/g, '') // Keep only printable ASCII characters
            .replace(/[^\w\s.,!?;:()\-"'\n]/g, '') // Keep only normal text characters
            .trim();
        }
        
        setSummary(cleanSummary || `Summary: This is a ${file.name} file with ${file.size} bytes of content.`);
                setSummaryMeta({
                  source: result.source,
                  model: result.model,
                  warning: result.warning
                });
        setMessage(`Summary generated for ${file.name}`);
      } else {
        // Fallback summary if API fails
        const fallbackSummary = `File Summary: ${file.name} is a ${file.type || 'document'} file uploaded on ${new Date(file.uploadedAt).toLocaleDateString()}. File size: ${(file.size / 1024).toFixed(1)} KB.`;
        setSummary(fallbackSummary);
                setSummaryMeta({ source: 'fallback' });
        setMessage(`Fallback summary generated for ${file.name} (AI service unavailable)`);
        console.warn('API error:', result.error || 'Unknown error');
      }
      
    } catch (error) {
      console.error('Error summarizing file:', error);
      // Provide fallback summary even on network error
      const fallbackSummary = `File Summary: ${file.name} is a ${file.type || 'document'} file uploaded on ${new Date(file.uploadedAt).toLocaleDateString()}. File size: ${(file.size / 1024).toFixed(1)} KB.`;
      setSummary(fallbackSummary);
              setSummaryMeta({ source: 'fallback' });
      setMessage(`Basic summary provided for ${file.name} (Service temporarily unavailable)`);
    } finally {
      setLoadingFiles(prev => ({ ...prev, [`summarize-${file.id}`]: false }));
    }
  };

  const handleViewFile = async (file) => {
    setLoadingFiles(prev => ({ ...prev, [`view-${file.id}`]: true }));
    setMessage('Loading file preview...');
    
    try {
      const response = await fetch(`https://uno1pwyend.execute-api.ap-south-1.amazonaws.com/prod/files/${file.id}/download`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (response.ok && result.downloadUrl) {
        window.open(result.downloadUrl, '_blank');
        setMessage(`Opened ${file.name} in new tab`);
      } else {
        setMessage(result.error || 'Unable to view file');
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      setMessage('Error opening file. Please try again.');
    } finally {
      setLoadingFiles(prev => ({ ...prev, [`view-${file.id}`]: false }));
    }
  };

  const handleDownloadFile = async (file) => {
    setLoadingFiles(prev => ({ ...prev, [`download-${file.id}`]: true }));
    setMessage('Preparing download...');
    
    try {
      const response = await fetch(`https://uno1pwyend.execute-api.ap-south-1.amazonaws.com/prod/files/${file.id}/download`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (response.ok && result.downloadUrl) {
        const downloadLink = document.createElement('a');
        downloadLink.href = result.downloadUrl;
        downloadLink.download = file.name;
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        setMessage(`Downloaded ${file.name} successfully!`);
      } else {
        setMessage(result.error || 'Download failed');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      setMessage('Error downloading file. Please try again.');
    } finally {
      setLoadingFiles(prev => ({ ...prev, [`download-${file.id}`]: false }));
    }
  };

  const handleDeleteNote = async (note) => {
    if (!window.confirm(`Are you sure you want to delete the note "${note.title}"? This action cannot be undone.`)) {
      return;
    }

    setLoadingFiles(prev => ({ ...prev, [`delete-note-${note.id}`]: true }));
    
    try {
      const response = await apiFetch(`/notes/${note.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setNotes(notes.filter(n => n.id !== note.id));
        setMessage(`Note "${note.title}" deleted successfully!`);
      } else {
        const result = await response.json();
        setMessage(result.error || 'Failed to delete note');
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      setMessage('Error deleting note. Please try again.');
    } finally {
      setLoadingFiles(prev => ({ ...prev, [`delete-note-${note.id}`]: false }));
    }
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Are you sure you want to delete the file "${file.name}"? This action cannot be undone.`)) {
      return;
    }

    setLoadingFiles(prev => ({ ...prev, [`delete-file-${file.id}`]: true }));
    
    try {
      const response = await apiFetch(`/files/${file.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setFiles(files.filter(f => f.id !== file.id));
        setMessage(`File "${file.name}" deleted successfully!`);
      } else {
        const result = await response.json();
        setMessage(result.error || 'Failed to delete file');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      setMessage('Error deleting file. Please try again.');
    } finally {
      setLoadingFiles(prev => ({ ...prev, [`delete-file-${file.id}`]: false }));
    }
  };



  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Filter notes and files based on search query
  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="view-notes">
      <div className="page-header">
        <h2>View Notes & Files</h2>
        <Link to="/" className="back-btn">← Back to Dashboard</Link>
      </div>

      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'info'}`}>
          {message}
        </div>
      )}

      {isLoading ? (
        <div className="loading">Loading your notes and files...</div>
      ) : (
        <>
          {/* Search Bar */}
          <div className="search-container">
            <input
              type="text"
              placeholder="🔍 Search notes and files by name or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="clear-search-btn"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Results Summary */}
          {searchQuery && (
            <div className="search-results-summary">
              Found <strong>{filteredNotes.length}</strong> note{filteredNotes.length !== 1 ? 's' : ''} and <strong>{filteredFiles.length}</strong> file{filteredFiles.length !== 1 ? 's' : ''}
            </div>
          )}

          <div className="content-sections">
          {/* Notes Section */}
          <div className="section">
            <h3>Your Notes ({filteredNotes.length})</h3>
            {filteredNotes.length === 0 ? (
              <p className="empty-state">
                {searchQuery ? `No notes found matching "${searchQuery}". ` : 'No notes found. '}
                <Link to="/create">Create your first note</Link>
              </p>
            ) : (
              <div className="notes-grid">
                {filteredNotes.map((note) => (
                  <div key={note.id} className="note-card">
                    <h4>{note.title}</h4>
                    <p className="note-preview">
                      {note.content.substring(0, 150)}
                      {note.content.length > 150 ? '...' : ''}
                    </p>
                    <div className="note-meta">
                      <span className="date">{formatDate(note.createdAt)}</span>
                      <button
                        onClick={() => handleDeleteNote(note)}
                        disabled={loadingFiles[`delete-note-${note.id}`]}
                        className="action-btn delete-btn"
                        title="Delete this note"
                      >
                        {loadingFiles[`delete-note-${note.id}`] ? 'Deleting...' : '🗑️ Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Files Section */}
          <div className="section">
            <h3>Your Files ({filteredFiles.length})</h3>
            {filteredFiles.length === 0 ? (
              <p className="empty-state">
                {searchQuery ? `No files found matching "${searchQuery}". ` : 'No files uploaded. '}
                <Link to="/create">Upload your first file</Link>
              </p>
            ) : (
              <div className="files-list">
                {filteredFiles.map((file) => (
                  <div key={file.id} className="file-card">
                    <div className="file-info">
                      <h4>{file.name}</h4>
                      <p className="file-meta">
                        Size: {formatFileSize(file.size)} • 
                        Uploaded: {formatDate(file.uploadedAt)}
                      </p>
                    </div>
                    <div className="file-actions">
                      <button 
                        onClick={() => handleSummarizeFile(file)}
                        disabled={loadingFiles[`summarize-${file.id}`]}
                        className="action-btn secondary"
                      >
                        {loadingFiles[`summarize-${file.id}`] ? 'Summarizing...' : 'Summarize'}
                      </button>
                      <button 
                        onClick={() => handleViewFile(file)}
                        disabled={loadingFiles[`view-${file.id}`]}
                        className="action-btn secondary"
                      >
                        {loadingFiles[`view-${file.id}`] ? 'Opening...' : 'View'}
                      </button>
                      <button 
                        onClick={() => handleDownloadFile(file)}
                        disabled={loadingFiles[`download-${file.id}`]}
                        className="action-btn primary"
                      >
                        {loadingFiles[`download-${file.id}`] ? 'Downloading...' : 'Download'}
                      </button>
                      <button 
                        onClick={() => handleDeleteFile(file)}
                        disabled={loadingFiles[`delete-file-${file.id}`]}
                        className="action-btn delete-btn"
                        title="Delete this file"
                      >
                        {loadingFiles[`delete-file-${file.id}`] ? 'Deleting...' : '🗑️ Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary Section */}
          {summary && (
            <div className="section">
              <h3>File Summary</h3>
              <div className="summary-card">
                <h4>{selectedItem?.name}</h4>
                {summaryMeta && (
                  <p className="summary-meta">
                    {summaryMeta.source === 'bedrock' ? 'Generated by Claude 3 (Bedrock)' : 'Fallback summarizer (non-AI)'}
                    {summaryMeta.model ? ` • Model: ${summaryMeta.model}` : ''}
                    {summaryMeta.warning ? ` • ${summaryMeta.warning}` : ''}
                  </p>
                )}
                <p>{summary}</p>
              </div>
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}

export default ViewNotes;