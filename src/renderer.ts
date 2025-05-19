import { ipcRenderer } from 'electron';

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const pathInput = document.getElementById('path-input') as HTMLInputElement;
    const listBtn = document.getElementById('list-btn') as HTMLButtonElement;
    const fileList = document.getElementById('file-list') as HTMLDivElement;

    // Add click event handler for the button
    listBtn.addEventListener('click', () => {
        const path = pathInput.value.trim();
        if (!path) {
            displayError('Please enter a valid folder path');
            return;
        }

        // Request the main process to list files from the specified directory
        ipcRenderer.send('list-directory', path);
        
        // Show loading state
        fileList.innerHTML = '<p>Loading files...</p>';
    });

    // Listen for the response from the main process
    ipcRenderer.on('directory-listed', (_, result: { success: boolean, files?: string[], error?: string }) => {
        if (result.success && result.files) {
            displayFiles(result.files);
        } else {
            displayError(result.error || 'Unknown error occurred');
        }
    });

    // Function to display files in the UI
    function displayFiles(files: string[]) {
        if (files.length === 0) {
            fileList.innerHTML = '<p>No files found in this directory</p>';
            return;
        }

        const fileItems = files
            .map(file => `<div class="file-item">${file}</div>`)
            .join('');
        
        fileList.innerHTML = fileItems;
    }

    // Function to display error messages
    function displayError(message: string) {
        fileList.innerHTML = `<div class="error">${message}</div>`;
    }
});
