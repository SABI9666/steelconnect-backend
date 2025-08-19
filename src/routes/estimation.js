// Load contractor's estimations
async function loadEstimations() {
    try {
        const response = await apiCall('/contractor/estimations');
        const estimations = response.estimations || [];
        
        const container = document.getElementById('estimations-list');
        container.innerHTML = estimations.map(est => `
            <div class="estimation-item">
                <h3>${est.projectTitle}</h3>
                <p>Status: <span class="status ${est.status}">${est.status}</span></p>
                <p>Submitted: ${new Date(est.createdAt).toLocaleDateString()}</p>
                ${est.estimatedAmount ? `<p>Estimated Amount: $${est.estimatedAmount}</p>` : ''}
                <div class="actions">
                    <button onclick="viewDetails('${est._id}')">View Details</button>
                    ${est.resultFile ? `<button onclick="downloadResult('${est._id}')">Download Result</button>` : ''}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load estimations');
    }
}

// Submit new estimation
async function submitEstimation(formData) {
    try {
        const response = await fetch('/api/contractor/estimations', {
            method: 'POST',
            body: formData // FormData with files
        });
        
        if (response.ok) {
            alert('Estimation request submitted successfully!');
            window.location.href = 'estimations.html';
        }
    } catch (error) {
        alert('Failed to submit estimation request');
    }

}
export default router;
