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

    // Image size setting
    game.settings.register("metareact", "imgSize", {
      name: "Image Size",
      hint: "Size of your character image snippet (0-200%).",
      scope: "client",
      config: false,
      type: Number,
      default: 100,
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

  // Get image size for current token (with fallback to global setting)
  getImageSize() {
    const tokenSettings = this.getTokenSettings();
    return tokenSettings.imgSize || this.getSetting("imgSize", 100);
  }

  // Save image size for current token
  saveImageSize(size) {
    this.saveTokenSettings({ imgSize: size });
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
    const size = this.getImageSize();
    
    // Replace default approval/disapproval with custom messages
    if (approvalText === "approves.") {
      approvalText = this.getApprovalMessage();
    } else if (approvalText === "disapproves") {
      approvalText = this.getDisapprovalMessage();
    }
    
    socket.executeForEveryone("approval", name, art, approvalText, position, size);
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
    const currentImgSize = this.getImageSize();
    const duration = this.getSetting("approvalDuration", 5);
    const approvalMsg = this.getApprovalMessage();
    const disapprovalMsg = this.getDisapprovalMessage();
    const currentArt = this.getCurrentUserArt();
    
    // Parse X and Y values to numbers (remove % and convert)
    const xValue = parseInt(currentImgPos.x.replace('%', ''));
    const yValue = parseInt(currentImgPos.y.replace('%', ''));
    
    const content = `
      <form>
        <div class="form-group" style="
          flex-wrap:wrap; 
          height:90px;
        ">
        <div style="position:absolute; top:35px; height:20px; margin-left:42px;>Reaction Preview:</div>
          <div id="imagePreview" style="
            position: fixed;
            margin-left:42px;
            height: 70px; 
            width: 300px;
            border: 2px solid #ccc; 
            background-image: url('${currentArt}');
            background-size: ${currentImgSize}%;
            background-position: ${currentImgPos.x} ${currentImgPos.y};
            background-repeat: no-repeat;
            overflow: hidden;
            box-sizing: border-box;
          ">
            <div style="
              position: absolute;
              background-color: #0000005e;
              color: white;
              padding: 2px;
              bottom: 0;
              left: 0;
              width: 300px;
              height:70px
              font-size: 15px;
              text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            ">${this.getCurrentUserName()} ${approvalMsg}</div>
          </div>
        </div>
        <div class="form-group">
          <label>Image Position X: <span id="xValue">${xValue}%</span></label>
          <input type="range" name="imgPositionX" min="0" max="100" value="${xValue}" 
                 oninput="updatePreview()">
        </div>
        <div class="form-group">
          <label>Image Position Y: <span id="yValue">${yValue}%</span></label>
          <input type="range" name="imgPositionY" min="0" max="100" value="${yValue}" 
                 oninput="updatePreview()">
        </div>
        <div class="form-group">
          <label>Image Size: <span id="sizeValue">${currentImgSize}%</span></label>
          <input type="range" name="imgSize" min="0" max="200" value="${currentImgSize}" 
                 oninput="updatePreview()">
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
        <script>
          function updatePreview() {
            const xSlider = document.querySelector('input[name="imgPositionX"]');
            const ySlider = document.querySelector('input[name="imgPositionY"]');
            const sizeSlider = document.querySelector('input[name="imgSize"]');
            const approvalInput = document.querySelector('input[name="approvalMessage"]');
            const preview = document.getElementById('imagePreview');
            const previewText = preview.querySelector('div');
            
            const xVal = xSlider.value;
            const yVal = ySlider.value;
            const sizeVal = sizeSlider.value;
            const approvalVal = approvalInput.value || 'approves.';
            
            document.getElementById('xValue').textContent = xVal + '%';
            document.getElementById('yValue').textContent = yVal + '%';
            document.getElementById('sizeValue').textContent = sizeVal + '%';
            
            preview.style.backgroundPosition = xVal + '% ' + yVal + '%';
            preview.style.backgroundSize = sizeVal + '%';
            previewText.textContent = 'Preview: ${this.getCurrentUserName()} ' + approvalVal;
          }
        </script>
      </form>
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
            const imgSize = parseInt(formData.get("imgSize"));
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
              this.saveImageSize(imgSize);
              this.saveApprovalMessage(approvalMessage);
              this.saveDisapprovalMessage(disapprovalMessage);
            } else {
              this.setSetting("imgPosition", JSON.stringify(imgPosition));
              this.setSetting("imgSize", imgSize);
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
      default: "save"
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
          <div style="max-height: 120px; overflow-y: auto; border: 1px solid #ccc; padding: 8px; margin-bottom: 10px;">
            ${customApprovals.map((msg, index) => `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; padding: 2px 4px; background: rgba(0,0,0,0.1); border-radius: 3px;">
                <span style="flex: 1; cursor: pointer; font-size: 12px;" onclick="document.querySelector('input[name=customMessage]').value = '${msg.replace(/'/g, "\\'")}'">${msg}</span>
                <button type="button" style="height:15px; width:15px; line-height:10px; background: #dc3545; color: white; border: none; border-radius: 2px; padding: 2px 4px; font-size: 10px; cursor: pointer; margin-left: 4px;" onclick="this.parentElement.remove(); metaReactInstance.removeCustomApproval(${index});">×</button>
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
          <input type="text" name="customMessage" placeholder="How does your character react?" style="width: 100%;">
        </div>
        <p style="color: #888; font-style: italic; margin: 10px 0; font-size: 12px;">
          💾 All custom messages are automatically saved. <br> Click saved messages to reuse them! :)
        </p>
      </form>
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
            const customMessage = formData.get("customMessage");

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
      default: "send"
    }).render(true);
  }

  // Remove a custom approval message
  removeCustomApproval(index) {
    const customApprovals = JSON.parse(this.getSetting("customApprovals", "[]"));
    customApprovals.splice(index, 1);
    this.setSetting("customApprovals", JSON.stringify(customApprovals));
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

  approval(name, art, approval, imgPosition = null, imgSize = null) {
    // Use provided position/size or fall back to user's settings
    const position = imgPosition || this.getImagePosition();
    const size = imgSize || this.getImageSize();
    const duration = this.getSetting("approvalDuration", 5) * 1000;

    let newContainer = document.createElement('div');
    let newTitle = document.createElement('div');
    
    newContainer.style.height = "70px";
    newContainer.style.width = "300px";
    newContainer.style.transition = "opacity 1s";
    newContainer.style.position = "relative";

    newContainer.style.backgroundImage = `url(${art})`;
    newContainer.style.backgroundSize = `${size}%`;
    newContainer.style.backgroundPosition = `${position.x} ${position.y}`;
    newContainer.style.backgroundRepeat = "no-repeat";
    
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

function approval(name, art, approvalText, imgPosition, imgSize) {
  metaReactInstance?.approval(name, art, approvalText, imgPosition, imgSize);
}