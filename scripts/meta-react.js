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
    // Image position setting
    game.settings.register("metareact", "imgPosition", {
      name: "Image Position",
      hint: "Vertical position (%) of your character image snippet.",
      scope: "client",
      config: false,
      type: String,
      default: "15%",
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
    return tokenSettings.imgPosition || this.getSetting("imgPosition", "15%");
  }

  // Save image position for current token
  saveImagePosition(position) {
    this.saveTokenSettings({ imgPosition: position });
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
    
    const content = `
      <form>
        <div class="form-group">
          <label>Image Position (0-100%):</label>
          <input type="text" name="imgPosition" value="${currentImgPos}" placeholder="15%">
        </div>
        <div class="form-group">
          <label>Display Duration (seconds):</label>
          <input type="number" name="duration" value="${duration}" min="1" max="30">
        </div>
        <div class="form-group">
          <label>This setting applies to:</label>
          <select name="scope">
            <option value="token">Current Token Only</option>
            <option value="global">All My Tokens</option>
          </select>
        </div>
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
            const imgPosition = formData.get("imgPosition");
            const duration = parseInt(formData.get("duration"));
            const scope = formData.get("scope");

            // Save duration globally
            this.setSetting("approvalDuration", duration);

            // Save image position based on scope
            if (scope === "token") {
              this.saveImagePosition(imgPosition);
            } else {
              this.setSetting("imgPosition", imgPosition);
            }

            ui.notifications.info("Settings saved!");
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
          <label>Quick Select:</label>
          <select name="quickSelect">
            <option value="">-- Select a saved message --</option>
            ${customApprovals.map((msg, index) => `<option value="${index}">${msg}</option>`).join('')}
          </select>
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
        <div class="form-group">
          <label>
            <input type="checkbox" name="saveMessage"> Save this message for later
          </label>
        </div>
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
            const quickSelect = formData.get("quickSelect");
            let customMessage = formData.get("customMessage");
            const saveMessage = formData.get("saveMessage");

            // Use quick select if chosen
            if (quickSelect !== "" && customApprovals[quickSelect]) {
              customMessage = customApprovals[quickSelect];
            }

            if (!customMessage.trim()) {
              ui.notifications.warn("Please enter a message!");
              return;
            }

            // Save message if requested
            if (saveMessage && !customApprovals.includes(customMessage)) {
              customApprovals.push(customMessage);
              this.setSetting("customApprovals", JSON.stringify(customApprovals));
            }

            this.sendApproval(customMessage);
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
    newContainer.style.backgroundPosition = "100% " + position;
    
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