import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './ViewNotes.css';
import { apiFetch } from '../api';

function ViewNotes() {
  const [notes, setNotes] = useState([]);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [loadingFiles, setLoadingFiles] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [viewingFullNote, setViewingFullNote] = useState(null);
  
  const MAX_PREVIEW_LENGTH =60; // Characters to show before "Read More"

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

  const handleDownloadFile = async (file) => {
    setLoadingFiles(prev => ({ ...prev, [`download-${file.id}`]: true }));
    setMessage('Preparing download...');
    
    try {
      const response = await apiFetch(`/files/${file.id}/download`, {
        method: 'GET'
      });

      const result = await response.json();
      
      if (response.ok && result.downloadUrl) {
        const downloadLink = document.createElement('a');
        downloadLink.href = result.downloadUrl;
        downloadLink.download = getCleanFileName(file.name);
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        setMessage(`Downloaded ${getCleanFileName(file.name)} successfully!`);
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
    if (!window.confirm(`Are you sure you want to delete the file "${getCleanFileName(file.name)}"? This action cannot be undone.`)) {
      return;
    }

    setLoadingFiles(prev => ({ ...prev, [`delete-file-${file.id}`]: true }));
    
    try {
      const response = await apiFetch(`/files/${file.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setFiles(files.filter(f => f.id !== file.id));
        setMessage(`File "${getCleanFileName(file.name)}" deleted successfully!`);
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

  // Edit note handlers
  const handleEditNote = (note) => {
    setEditingNote(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setMessage('');
  };

  const handleCancelEdit = () => {
    setEditingNote(null);
    setEditTitle('');
    setEditContent('');
  };

  const handleSaveEdit = async (note) => {
    if (!editTitle.trim()) {
      setMessage('Note title cannot be empty');
      return;
    }

    setLoadingFiles(prev => ({ ...prev, [`edit-note-${note.id}`]: true }));

    try {
      // Update the note in the state
      const updatedNotes = notes.map(n =>
        n.id === note.id
          ? { ...n, title: editTitle, content: editContent, updatedAt: new Date().toISOString() }
          : n
      );
      setNotes(updatedNotes);
      setEditingNote(null);
      setEditTitle('');
      setEditContent('');
      setMessage(`Note "${editTitle}" updated successfully!`);
    } catch (error) {
      console.error('Error updating note:', error);
      setMessage('Error updating note. Please try again.');
    } finally {
      setLoadingFiles(prev => ({ ...prev, [`edit-note-${note.id}`]: false }));
    }
  };

  // Handler to open full note view
  const handleReadMore = (note) => {
    setViewingFullNote(note);
  };

  // Handler to close full note view
  const handleCloseFullNote = () => {
    setViewingFullNote(null);
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

  const getCleanFileName = (filename) => {
    // Remove timestamp prefix (e.g., "1765174533008-filename.pdf" -> "filename.pdf")
    if (filename && filename.includes('-')) {
      const parts = filename.split('-');
      // Check if first part is a timestamp (all digits)
      if (parts[0] && /^\d+$/.test(parts[0])) {
        return parts.slice(1).join('-');
      }
    }
    return filename;
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
                  <div key={note.id} className={`note-card ${editingNote === note.id ? 'editing' : ''}`}>
                    {editingNote === note.id ? (
                      // Edit Mode
                      <div className="note-edit-form">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Note title..."
                          className="edit-input edit-title"
                          maxLength="100"
                        />
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          placeholder="Note content..."
                          className="edit-input edit-content"
                          rows="6"
                        />
                        <div className="edit-actions">
                          <button
                            onClick={() => handleSaveEdit(note)}
                            disabled={loadingFiles[`edit-note-${note.id}`]}
                            className="icon-btn primary"
                            title="Save changes"
                          >
                            {loadingFiles[`edit-note-${note.id}`] ? '⏳' : '💾'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="icon-btn secondary"
                            title="Cancel editing"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <>
                        <h4>{note.title}</h4>
                        <p className="note-preview">
                          {note.content.substring(0, MAX_PREVIEW_LENGTH)}
                          {note.content.length > MAX_PREVIEW_LENGTH && '...'}
                        </p>
                        <div className="note-meta">
                          <span className="date">{formatDate(note.createdAt)}</span>
                          <div className="note-actions">
                            {note.content.length > MAX_PREVIEW_LENGTH && (
                              <button
                                onClick={() => handleReadMore(note)}
                                className="icon-btn read-more-dots"
                                title="Read full note"
                              >
                                ⋯
                              </button>
                            )}
                            <button
                              onClick={() => handleEditNote(note)}
                              className="icon-btn secondary"
                              title="Edit this note"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteNote(note)}
                              disabled={loadingFiles[`delete-note-${note.id}`]}
                              className="icon-btn delete-btn"
                              title="Delete this note"
                            >
                              {loadingFiles[`delete-note-${note.id}`] ? '⏳' : '🗑️'}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
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
                      <h4>{getCleanFileName(file.name)}</h4>
                      <p className="file-meta">
                        Size: {formatFileSize(file.size)} • 
                        Uploaded: {formatDate(file.uploadedAt)}
                      </p>
                    </div>
                    <div className="file-actions">
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
          </div>
        </>
      )}

      {/* Full Note Modal */}
      {viewingFullNote && (
        <div className="modal-overlay" onClick={handleCloseFullNote}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={handleCloseFullNote} title="Close">
              ✕
            </button>
            <div className="modal-body">
              <h2>{viewingFullNote.title}</h2>
              <p className="modal-date">{formatDate(viewingFullNote.createdAt)}</p>
              <p className="modal-full-content">{viewingFullNote.content}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ViewNotes;