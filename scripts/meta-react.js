let socket;
let module;

class Status extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "elt-status",
      title: "Messages",
      template: `modules/metareact/templates/status.hbs`,
      width: 300,
      height: 100,
      top: 80,
      left: 130,
      resizable: false,
      minimizable: false,
    });
  }
}

let metaReactInstance;

class MetaReact {
  constructor() {
    metaReactInstance = this;

    Hooks.once("socketlib.ready", this.onSocketReady.bind(this));
    Hooks.once("init", this.onInit.bind(this));
    Hooks.once("ready", this.onReady.bind(this));
  }

  // Register all per-player settings
  registerSettings() {
    // Image position setting (now supports both X and Y)
    game.settings.register("metareact", "imgPosition", {
      name: "Image Position",
      hint: "Position (X%, Y%) of your character image snippet.",
      scope: "client",
      config: false,
      type: String,
      default: JSON.stringify({ x: "100%", y: "15%" }),
    });

    // Custom approval messages (stored as JSON string)
    game.settings.register("metareact", "customApprovals", {
      name: "Custom Approval Messages",
      hint: "Your saved custom approval messages.",
      scope: "client",
      config: false,
      type: String,
      default: JSON.stringify([]),
    });

    // Custom approval message (always persisted)
    game.settings.register("metareact", "defaultApprovalMessage", {
      name: "Default Approval Message",
      hint: "Your custom approval message.",
      scope: "client",
      config: false,
      type: String,
      default: "approves.",
    });

    // Custom disapproval message (always persisted)
    game.settings.register("metareact", "defaultDisapprovalMessage", {
      name: "Default Disapproval Message",
      hint: "Your custom disapproval message.",
      scope: "client",
      config: false,
      type: String,
      default: "disapproves.",
    });

    // Preferred approval speed/duration
    game.settings.register("metareact", "approvalDuration", {
      name: "Approval Display Duration",
      hint: "How long (in seconds) approvals stay visible.",
      scope: "client",
      config: false,
      type: Number,
      default: 5,
    });

    // Show/hide certain approval types
    game.settings.register("metareact", "enabledApprovals", {
      name: "Enabled Approval Types",
      hint: "Which approval buttons to show.",
      scope: "client",
      config: false,
      type: String,
      default: JSON.stringify({
        approve: true,
        disapprove: true,
        remember: true,
        custom: true
      }),
    });

    // Character-specific settings (keyed by token ID)
    game.settings.register("metareact", "tokenSettings", {
      name: "Token-Specific Settings",
      hint: "Settings specific to each token/character.",
      scope: "client",
      config: false,
      type: String,
      default: JSON.stringify({}),
    });
  }

  // Get setting value with fallback
  getSetting(key, defaultValue = null) {
    try {
      return game.settings.get("metareact", key);
    } catch (error) {
      console.warn(`MetaReact: Could not get setting ${key}`, error);
      return defaultValue;
    }
  }

  // Set setting value safely
  setSetting(key, value) {
    try {
      return game.settings.set("metareact", key, value);
    } catch (error) {
      console.error(`MetaReact: Could not set setting ${key}`, error);
    }
  }

  // Get current token's specific settings
  getTokenSettings(tokenId = null) {
    if (!tokenId) {
      tokenId = canvas.tokens.controlled[0]?.id;
    }
    
    if (!tokenId) return {};

    const allTokenSettings = JSON.parse(this.getSetting("tokenSettings", "{}"));
    return allTokenSettings[tokenId] || {};
  }

  // Save settings for a specific token
  saveTokenSettings(settings, tokenId = null) {
    if (!tokenId) {
      tokenId = canvas.tokens.controlled[0]?.id;
    }
    
    if (!tokenId) return;

    const allTokenSettings = JSON.parse(this.getSetting("tokenSettings", "{}"));
    allTokenSettings[tokenId] = { ...allTokenSettings[tokenId], ...settings };
    this.setSetting("tokenSettings", JSON.stringify(allTokenSettings));
  }

  // Get image position for current token (with fallback to global setting)
  getImagePosition() {
    const tokenSettings = this.getTokenSettings();
    const defaultPos = JSON.parse(this.getSetting("imgPosition", JSON.stringify({ x: "100%", y: "15%" })));
    return tokenSettings.imgPosition || defaultPos;
  }

  // Save image position for current token
  saveImagePosition(position) {
    this.saveTokenSettings({ imgPosition: position });
  }

  // Get custom approval message
  getApprovalMessage() {
    const tokenSettings = this.getTokenSettings();
    return tokenSettings.approvalMessage || this.getSetting("defaultApprovalMessage", "approves.");
  }

  // Save custom approval message
  saveApprovalMessage(message) {
    this.saveTokenSettings({ approvalMessage: message });
  }

  // Get custom disapproval message
  getDisapprovalMessage() {
    const tokenSettings = this.getTokenSettings();
    return tokenSettings.disapprovalMessage || this.getSetting("defaultDisapprovalMessage", "disapproves.");
  }

  // Save custom disapproval message
  saveDisapprovalMessage(message) {
    this.saveTokenSettings({ disapprovalMessage: message });
  }

  getCurrentUserName() {
    return canvas.tokens.controlled[0]?.nameplate?._text || "Unknown";
  }

  getCurrentUserArt() {
    return canvas.tokens.controlled[0]?.texture?.baseTexture?.textureCacheIds[0] || "";
  }

  sendApproval(approvalText) {
    const name = this.getCurrentUserName();
    const art = this.getCurrentUserArt();
    const position = this.getImagePosition();
    
    // Replace default approval/disapproval with custom messages
    if (approvalText === "approves.") {
      approvalText = this.getApprovalMessage();
    } else if (approvalText === "disapproves") {
      approvalText = this.getDisapprovalMessage();
    }
    
    socket.executeForEveryone("approval", name, art, approvalText, position);
  }

  cleanWindowClass(application) {
    const app = application.element[0];
    app.style.boxShadow = "none";
    app.style.background = "none";
    app.querySelector(".window-content").classList.remove("window-content");
    app.querySelector(".window-header").style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    app.querySelector(".window-header").style.border = "0";
    Array.from(app.querySelectorAll("button")).forEach((el) =>
      app.querySelector(".window-header").appendChild(el)
    );
    app.querySelector(".close")?.remove();
  }

  // Show settings dialog
  showSettingsDialog() {
    const currentImgPos = this.getImagePosition();
    const duration = this.getSetting("approvalDuration", 5);
    const approvalMsg = this.getApprovalMessage();
    const disapprovalMsg = this.getDisapprovalMessage();
    const currentArt = this.getCurrentUserArt();
    
    // Parse current position values to numbers
    const currentX = parseInt(currentImgPos.x.replace('%', '')) || 100;
    const currentY = parseInt(currentImgPos.y.replace('%', '')) || 15;
    
    const content = `
      <form>
        <div class="form-group">
          <label>Image Position Preview:</label>
          <div id="position-preview" style="
            width: 300px; 
            height: 70px; 
            background-image: url(${currentArt}); 
            background-size: cover; 
            background-position: ${currentX}% ${currentY}%;
            border: 2px solid #ccc;
            margin: 10px 0;
            position: relative;
          ">
            <div style="
              position: absolute;
              bottom: 0;
              left: 0;
              width: 100%;
              background: rgba(0,0,0,0.6);
              color: white;
              padding: 2px;
              font-size: 12px;
            ">Preview: ${this.getCurrentUserName()} ${approvalMsg}</div>
          </div>
        </div>
        <div class="form-group">
          <label>X-Axis Position: <span id="x-value">${currentX}%</span></label>
          <input type="range" name="imgPositionX" min="0" max="100" value="${currentX}" 
                 style="width: 100%;" oninput="updatePreview()">
        </div>
        <div class="form-group">
          <label>Y-Axis Position: <span id="y-value">${currentY}%</span></label>
          <input type="range" name="imgPositionY" min="0" max="100" value="${currentY}" 
                 style="width: 100%;" oninput="updatePreview()">
        </div>
        <div class="form-group">
          <label>Custom Approval Message:</label>
          <input type="text" name="approvalMessage" value="${approvalMsg}" placeholder="approves." 
                 oninput="updatePreview()">
        </div>
        <div class="form-group">
          <label>Custom Disapproval Message:</label>
          <input type="text" name="disapprovalMessage" value="${disapprovalMsg}" placeholder="disapproves.">
        </div>
        <div class="form-group">
          <label>Display Duration (seconds):</label>
          <input type="number" name="duration" value="${duration}" min="1" max="30">
        </div>
        <div class="form-group">
          <label>Apply settings to:</label>
          <select name="scope">
            <option value="token">Current Token Only</option>
            <option value="global">All My Tokens</option>
          </select>
        </div>
      </form>
      <script>
        function updatePreview() {
          const xSlider = document.querySelector('input[name="imgPositionX"]');
          const ySlider = document.querySelector('input[name="imgPositionY"]');
          const approvalInput = document.querySelector('input[name="approvalMessage"]');
          const preview = document.getElementById('position-preview');
          const xValue = document.getElementById('x-value');
          const yValue = document.getElementById('y-value');
          
          const x = xSlider.value;
          const y = ySlider.value;
          const approval = approvalInput.value || 'approves.';
          
          xValue.textContent = x + '%';
          yValue.textContent = y + '%';
          
          preview.style.backgroundPosition = x + '% ' + y + '%';
          preview.querySelector('div').textContent = 'Preview: ${this.getCurrentUserName()} ' + approval;
        }
      </script>
    `;

    new Dialog({
      title: "MetaReact Settings",
      content: content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: (html) => {
            const form = html[0].querySelector("form");
            const formData = new FormData(form);
            const imgPositionX = formData.get("imgPositionX") + "%";
            const imgPositionY = formData.get("imgPositionY") + "%";
            const approvalMessage = formData.get("approvalMessage");
            const disapprovalMessage = formData.get("disapprovalMessage");
            const duration = parseInt(formData.get("duration"));
            const scope = formData.get("scope");

            const imgPosition = { x: imgPositionX, y: imgPositionY };

            // Save duration globally
            this.setSetting("approvalDuration", duration);

            // Save settings based on scope
            if (scope === "token") {
              this.saveImagePosition(imgPosition);
              this.saveApprovalMessage(approvalMessage);
              this.saveDisapprovalMessage(disapprovalMessage);
            } else {
              this.setSetting("imgPosition", JSON.stringify(imgPosition));
              this.setSetting("defaultApprovalMessage", approvalMessage);
              this.setSetting("defaultDisapprovalMessage", disapprovalMessage);
            }

            ui.notifications.info("Settings saved and will persist!");
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "save",
      width: 450
    }).render(true);
  }

  // Show custom approval dialog
  showCustomApprovalDialog() {
    const customApprovals = JSON.parse(this.getSetting("customApprovals", "[]"));
    
    let savedApprovalsHtml = "";
    if (customApprovals.length > 0) {
      savedApprovalsHtml = `
        <div class="form-group">
          <label>Saved Messages:</label>
          <div id="saved-messages" style="max-height: 150px; overflow-y: auto; border: 1px solid #ccc; padding: 5px; margin: 5px 0;">
            ${customApprovals.map((msg, index) => `
              <div style="display: flex; align-items: center; margin: 2px 0; padding: 2px;">
                <button type="button" onclick="selectMessage('${msg.replace(/'/g, "\\'")}')" 
                        style="flex: 1; text-align: left; padding: 4px; margin-right: 5px; background: #f0f0f0; border: 1px solid #ddd;">
                  ${msg}
                </button>
                <button type="button" onclick="deleteMessage(${index})" 
                        style="background: #ff4444; color: white; border: none; padding: 4px 8px; font-size: 12px;" 
                        title="Delete this message">
                  ×
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const content = `
      <form>
        ${savedApprovalsHtml}
        <div class="form-group">
          <label>Custom Message:</label>
          <input type="text" id="customMessageInput" name="customMessage" placeholder="How does your character react?" style="width: 100%;">
        </div>
        <p style="color: #888; font-style: italic; margin: 10px 0;">
          💾 All custom messages are automatically saved for future use!
        </p>
      </form>
      <script>
        function selectMessage(message) {
          document.getElementById('customMessageInput').value = message;
        }
        
        function deleteMessage(index) {
          if (confirm('Delete this saved message?')) {
            // Get current messages
            const messages = ${JSON.stringify(customApprovals)};
            messages.splice(index, 1);
            
            // Save updated messages
            game.settings.set("metareact", "customApprovals", JSON.stringify(messages));
            
            // Close and reopen dialog to refresh
            ui.notifications.info("Message deleted!");
            setTimeout(() => {
              metaReactInstance.showCustomApprovalDialog();
            }, 100);
          }
        }
      </script>
    `;

    new Dialog({
      title: "Custom Approval",
      content: content,
      buttons: {
        send: {
          icon: '<i class="fas fa-paper-plane"></i>',
          label: "Send",
          callback: (html) => {
            const form = html[0].querySelector("form");
            const formData = new FormData(form);
            let customMessage = formData.get("customMessage");

            if (!customMessage.trim()) {
              ui.notifications.warn("Please enter a message!");
              return;
            }

            // Always save the message if it's new
            if (!customApprovals.includes(customMessage)) {
              customApprovals.push(customMessage);
              this.setSetting("customApprovals", JSON.stringify(customApprovals));
            }

            this.sendApproval(customMessage);
            ui.notifications.info("Custom message sent and saved!");
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "send",
      width: 500
    }).render(true);
  }

  onSocketReady() {
    socket = socketlib.registerModule("metareact");
    socket.register("approval", approval);
    console.log("The socket is ready to be used.");
  }

  onInit() {
    console.log("Meta React | Initialising the module.");
    this.registerSettings();
    module = game.modules.get("metareact");
    module.status = new Status();
    module.status.render(true);
  }

  onReady() {
    this.cleanWindowClass(module.status);
    Array.from(module.status.element[0].querySelectorAll(".module-control")).forEach((el) => {
      el.addEventListener("click", (event) => {
        const approvalText = event.currentTarget.dataset.approval;
        
        if (approvalText === "settings") {
          this.showSettingsDialog();
          return;
        } else if (approvalText === "custom") {
          this.showCustomApprovalDialog();
          return;
        }
        
        this.sendApproval(approvalText);
      });
    });
  }

  approval(name, art, approval, imgPosition = null) {
    // Use provided position or fall back to user's setting
    const position = imgPosition || this.getImagePosition();
    const duration = this.getSetting("approvalDuration", 5) * 1000;

    let newContainer = document.createElement('div');
    let newTitle = document.createElement('div');
    
    newContainer.style.height = "70px";
    newContainer.style.width = "300px";
    newContainer.style.transition = "opacity 1s";
    newContainer.style.position = "relative";

    newContainer.style.backgroundImage = `url(${art})`;
    newContainer.style.backgroundSize = "cover";
    newContainer.style.backgroundPosition = `${position.x} ${position.y}`;
    
    newTitle.innerHTML = `${name} ${approval}`;
    newTitle.style.position = "absolute";
    newTitle.style.backgroundColor = "#0000005e";
    newTitle.style.fontSize = "15px";
    newTitle.style.bottom = "0px";
    newTitle.style.left = "0px";
    newTitle.style.width = "300px";
    newTitle.style.padding = "2px";
    newTitle.style.color = "white";
    newTitle.style.textShadow = "1px 1px 2px rgba(0,0,0,0.8)";

    module.status.element[0].querySelector(".statusbox").appendChild(newContainer);
    newContainer.appendChild(newTitle);

    setTimeout(() => {
      newContainer.style.opacity = 0;
      setTimeout(() => newContainer.remove(), 1000);
    }, duration);
  }
}

new MetaReact();

function approval(name, art, approvalText, imgPosition) {
  metaReactInstance?.approval(name, art, approvalText, imgPosition);
}