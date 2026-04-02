/* === AgentColony — Ambitions & Benchmarks Panels === */

// =====================
// AMBITIONS PANEL
// =====================
async function showAmbitionsPanel() {
  try {
    // Fetch ambitions data
    const response = await fetch('/api/v1/ambitions');
    const data = await response.json();
    const ambitions = data.ambitions || [];
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'ambitions-modal';
    
    // Create modal panel
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>🏛️ Grand Ambitions</h2>
      <button class="modal-close">✕</button>
    `;
    
    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    if (!ambitions || ambitions.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
          <div style="font-size: 2rem; margin-bottom: 12px;">🌟</div>
          <p>No grand ambitions yet</p>
          <p style="font-size: 0.9rem; margin-top: 8px;">The agents are still dreaming...</p>
        </div>
      `;
    } else {
      const ambitionsHtml = ambitions.map(ambition => {
        const progress = ambition.targetCP > 0 ? (ambition.currentCP / ambition.targetCP) * 100 : 0;
        const statusEmoji = {
          'proposed': '💭',
          'active': '🚀',
          'completed': '✅'
        }[ambition.status] || '⭐';
        
        return `
          <div class="ambition-card">
            <div class="ambition-title">
              ${statusEmoji} ${ambition.title}
            </div>
            <div class="ambition-desc">${ambition.description}</div>
            
            <div class="ambition-progress">
              <div class="ambition-progress-fill" style="width: ${progress}%"></div>
            </div>
            
            <div class="ambition-meta">
              <div>
                <span style="color: rgba(255,255,255,0.8);">
                  ${ambition.proposerEmoji || '🤖'} ${ambition.proposerName || 'Anonymous'}
                </span>
                ${ambition.supporterCount > 0 ? `• ${ambition.supporterCount} supporters` : ''}
              </div>
              <div>
                <span style="color: #fbbf24; font-weight: 600;">
                  ${ambition.currentCP || 0}/${ambition.targetCP || '∞'} CP
                </span>
              </div>
            </div>
            
            ${ambition.phase ? `
              <div style="margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.5);">
                Phase: ${ambition.phase}
              </div>
            ` : ''}
            
            <div style="margin-top: 12px; text-align: center;">
              <button 
                class="fund-button" 
                style="
                  background: linear-gradient(90deg, #fbbf24, #f59e0b);
                  border: none;
                  color: white;
                  padding: 8px 16px;
                  border-radius: 6px;
                  font-size: 12px;
                  font-weight: 600;
                  cursor: not-allowed;
                  opacity: 0.6;
                "
                disabled
              >
                Fund This (Coming Soon)
              </button>
            </div>
          </div>
        `;
      }).join('');
      
      content.innerHTML = ambitionsHtml;
    }
    
    // Assemble modal
    panel.appendChild(header);
    panel.appendChild(content);
    overlay.appendChild(panel);
    
    // Add event listeners
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeAmbitionsPanel);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAmbitionsPanel();
    });
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
  } catch (error) {
    console.error('Failed to load ambitions:', error);
    showErrorModal('🏛️ Grand Ambitions', 'Failed to load ambitions data');
  }
}

function closeAmbitionsPanel() {
  const modal = document.getElementById('ambitions-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  }
}

// =====================
// BENCHMARKS PANEL
// =====================
async function showBenchmarksPanel() {
  try {
    // Fetch benchmarks data
    const response = await fetch('/api/v1/benchmarks');
    const data = await response.json();
    const benchmarks = data.benchmarks || [];
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'benchmarks-modal';
    
    // Create modal panel
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>📏 Human Benchmarks</h2>
      <button class="modal-close">✕</button>
    `;
    
    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    if (!benchmarks || benchmarks.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
          <div style="font-size: 2rem; margin-bottom: 12px;">📊</div>
          <p>No benchmarks yet</p>
          <p style="font-size: 0.9rem; margin-top: 8px;">The race hasn't begun...</p>
        </div>
      `;
    } else {
      const benchmarksHtml = benchmarks.map(benchmark => {
        // Determine status emoji based on agent vs human achievement
        let statusEmoji = '⬜'; // not-started
        let statusColor = 'rgba(255,255,255,0.3)';
        
        if (benchmark.agent_status === 'achieved' && benchmark.human_status === 'not-achieved') {
          statusEmoji = '🟢'; // exceeded
          statusColor = '#16a34a';
        } else if (benchmark.agent_status === 'achieved' && benchmark.human_status === 'achieved') {
          statusEmoji = '✅'; // matched
          statusColor = '#2563eb';
        } else if (benchmark.agent_status === 'in-progress' || benchmark.agent_status === 'pending') {
          statusEmoji = '🟡'; // in-progress
          statusColor = '#f59e0b';
        }
        
        return `
          <div class="benchmark-card">
            <div class="benchmark-status" style="color: ${statusColor};">
              ${statusEmoji}
            </div>
            <div class="benchmark-info">
              <div class="benchmark-title">${benchmark.description}</div>
              <div class="benchmark-detail">
                Human: ${benchmark.human_timeline} • Agent: ${benchmark.agent_timeline}
                ${benchmark.agent_date ? ` • Achieved: ${benchmark.agent_date}` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      content.innerHTML = benchmarksHtml;
    }
    
    // Assemble modal
    panel.appendChild(header);
    panel.appendChild(content);
    overlay.appendChild(panel);
    
    // Add event listeners
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeBenchmarksPanel);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeBenchmarksPanel();
    });
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
  } catch (error) {
    console.error('Failed to load benchmarks:', error);
    showErrorModal('📏 Human Benchmarks', 'Failed to load benchmark data');
  }
}

function closeBenchmarksPanel() {
  const modal = document.getElementById('benchmarks-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  }
}

// =====================
// UTILITY FUNCTIONS
// =====================
function showErrorModal(title, message) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.opacity = '0';
  
  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.innerHTML = `
    <div class="modal-header">
      <h2>${title}</h2>
      <button class="modal-close">✕</button>
    </div>
    <div class="modal-content" style="text-align: center; padding: 40px;">
      <div style="font-size: 2rem; margin-bottom: 12px;">⚠️</div>
      <p style="color: rgba(255,255,255,0.8);">${message}</p>
    </div>
  `;
  
  overlay.appendChild(panel);
  
  const closeBtn = panel.querySelector('.modal-close');
  closeBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200);
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 200);
    }
  });
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });
}

// Export functions to global scope for vanilla JS
window.showAmbitionsPanel = showAmbitionsPanel;
window.showBenchmarksPanel = showBenchmarksPanel;
window.closeAmbitionsPanel = closeAmbitionsPanel;
window.closeBenchmarksPanel = closeBenchmarksPanel;