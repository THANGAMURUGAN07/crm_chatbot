const chatWrapper = document.getElementById('chat-wrapper');
const toggleButton = document.getElementById('chat-toggle-button');
const messagesFrame = document.getElementById('messages-frame');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const voiceButton = document.getElementById('voice-button');

// ✅ Voice load
let availableVoices = [];
function loadVoices() { availableVoices = speechSynthesis.getVoices(); }
if (speechSynthesis.onvoiceschanged !== undefined) { speechSynthesis.onvoiceschanged = loadVoices; }
loadVoices();

// 🪄 Welcome image shake logic
let hasSentFirstMessage = false;
function startShakingWelcomeImage() {
  const img = document.getElementById('welcome-image');
  if (img) img.classList.add('shake');
}
function stopAndRemoveWelcomeImage() {
  if (!hasSentFirstMessage) {
    const img = document.getElementById('welcome-image');
    if (img) {
      img.classList.remove('shake');
      img.style.transition = 'opacity 0.5s';
      img.style.opacity = '0';
      setTimeout(() => img.remove(), 500);
    }
    hasSentFirstMessage = true;
  }
}

// Toggle chat open → start shaking
toggleButton.addEventListener('click', () => {
  chatWrapper.classList.toggle('active');
  if (chatWrapper.classList.contains('active') && !hasSentFirstMessage) {
    startShakingWelcomeImage();
  }
});

// Send text message
sendButton.addEventListener('click', () => {
  const message = userInput.value.trim();
  if (message) {
    stopAndRemoveWelcomeImage();
    addMessage(message, 'user');
    getBotReply(message, 'text');
    userInput.value = '';
  }
});
userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const message = userInput.value.trim();
    if (message) {
      stopAndRemoveWelcomeImage();
      addMessage(message, 'user');
      getBotReply(message, 'text');
      userInput.value = '';
    }
  }
});

// ✅ Add message with avatar
function addMessage(content, type) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message-container', type);

  const avatar = document.createElement('img');
  avatar.classList.add('message-avatar');
  avatar.src = (type === 'bot') ? 'images/bot_avatar.gif' : 'images/user_avatar.gif';
  avatar.alt = (type === 'bot') ? 'Bot' : 'User';

  const bubble = document.createElement('div');
  bubble.classList.add('message-bubble');
  bubble.innerHTML = content;

  if (type === 'bot') {
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(bubble);
  } else {
    messageDiv.appendChild(bubble);
    messageDiv.appendChild(avatar);
  }

  messagesFrame.appendChild(messageDiv);
  messagesFrame.scrollTop = messagesFrame.scrollHeight;
}

// ✅ Get bot reply
async function getBotReply(message, mode) {
  try {
    const response = await fetch("https://crmchatbot-production.up.railway.app/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId: "default" }),
    });
    const data = await response.json();
    const botReply = data.response;
    addMessage(botReply, 'bot');

    if (mode === 'voice') {
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      const cleanText = stripHTML(botReply)
        .replace(/[•*✅😊🙏📌🙂📧📱🏢📝🗓️💡😴🤗🌙☀️🌤🚀⚠️❌🔄✅]+/g, '')
        .replace(/<li>/g, '').replace(/<\/li>/g, ', ')
        .replace(/<ul>|<\/ul>/g, '').replace(/ +/g, ' ').trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-IN'; utterance.rate = 0.9; utterance.pitch = 1;

      let tryCount = 0;
      const waitAndSpeak = () => {
        if (availableVoices.length > 0) {
          const voice = availableVoices.find(v =>
            v.name.includes('Google UK English Female') ||
            v.name.includes('Microsoft Aria') ||
            v.name.includes('Google US English') ||
            v.lang === 'en-IN'
          ) || availableVoices[0];
          utterance.voice = voice;
          speechSynthesis.speak(utterance);
        } else if (tryCount < 10) {
          tryCount++; setTimeout(waitAndSpeak, 200);
        } else console.error("❌ Voices not loaded.");
      };
      waitAndSpeak();
    }
  } catch (error) {
    console.error("Error:", error);
    addMessage("⚠️ Bot error. Try again later.", 'bot');
  }
}

function stripHTML(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

// 🎤 Voice recognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;
const recognition = new SpeechRecognition();
recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;

const grammar = '#JSGF V1.0; grammar words; public <word> = mail | phone | status | company | notes | contact | email | mobile | customer ;';
const speechRecognitionList = new SpeechGrammarList();
speechRecognitionList.addFromString(grammar, 1);
recognition.grammars = speechRecognitionList;

voiceButton.addEventListener('click', () => {
  try { recognition.start(); }
  catch (e) { console.warn('Recognition already started'); }
});

recognition.onstart = () => {
  voiceButton.classList.add('listening');
  addMessage('🎤 Listening...', 'bot');
};

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  stopAndRemoveWelcomeImage();

  // Remove last '🎤 Listening...' bot message
  const lastBotMsg = messagesFrame.querySelector('.message-container.bot:last-child .message-bubble');
  if (lastBotMsg && lastBotMsg.textContent === '🎤 Listening...') {
    lastBotMsg.parentElement.remove();
  }

  addMessage(transcript, 'user');
  getBotReply(transcript, 'voice');
};

recognition.onspeechend = () => setTimeout(() => recognition.stop(), 1000);
recognition.onsoundend = () => setTimeout(() => recognition.stop(), 3000);

recognition.onerror = (event) => {
  console.error("Speech recognition error:", event.error);
  voiceButton.classList.remove('listening');
  addMessage(`❌ Voice recognition error: ${event.error}`, 'bot');
};

recognition.onend = () => voiceButton.classList.remove('listening');