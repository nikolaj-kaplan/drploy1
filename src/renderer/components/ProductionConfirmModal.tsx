import React from 'react';

interface ProductionConfirmModalProps {
  environmentName: string;
  isVisible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ProductionConfirmModal: React.FC<ProductionConfirmModalProps> = ({
  environmentName,
  isVisible,
  onConfirm,
  onCancel
}) => {
  if (!isVisible) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Only close if clicking the overlay itself, not the modal content
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter') {
      // Don't auto-confirm on Enter for safety
      e.preventDefault();
    }
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="production-confirm-modal">
        <div className="warning-icon">⚠️</div>
        <h2>🚨 DANGER ZONE 🚨</h2>
        <p>
          You are about to deploy to the <span className="env-name">{environmentName}</span> environment!
        </p>
        <p>
          <strong>This is a PRODUCTION environment.</strong>
          <br />
          This action will affect live users and systems.
        </p>
        <p>
          Are you absolutely sure you want to proceed?
        </p>
        
        <div className="modal-buttons">
          <button 
            className="safe-button" 
            onClick={onCancel}
            autoFocus
          >
            Cancel (Safe)
          </button>
          <button 
            className="danger-button" 
            onClick={onConfirm}
          >
            Deploy to Production
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductionConfirmModal;
