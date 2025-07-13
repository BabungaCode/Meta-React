let socket;
let module;
let metaReactInstance;

// --- Register setting as a per-player token-to-position map ---
Hooks.once("init", () => {
  game.settings.register("metareact", "imgPositionsByToken", {
    name: "Image Positions by Token",
    hint: "Stores individual image vertical positions per token.",
    scope: "client",
    config: false,
    type: Object,
    default: {},
  });
});

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

// --- Helper: Get image position for token name ---
function getImagePositionForToken(tokenName) {
  const all = game.settings.get("metareact", "imgPositionsByToken") || {};
  return all[tokenName] || "15%";
}

// --- Helper: Set image position for token name ---
function setImagePositionForToken(tokenName, position) {
  const all = game.settings.get("metareact", "imgPositionsByToken") || {};
  all[tokenName] = position;
  game.settings.set("metareact", "imgPositionsByToken", all);
}

class MetaReact {
  constructor() {
    metaReactInstance = this;

    Hooks.once("socketlib.ready", this.onSocketReady.bind(this));
    Hooks.once("ready", this.onReady.bind(this));
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
    socket.executeForEveryone("approval", name, art, approvalText);
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

  onSocketReady() {
    socket = socketlib.registerModule("metareact");
    socket.register("approval", approval);
    console.log("MetaReact | Socket ready.");
  }

  onReady() {
    console.log("Meta React | Initialising the module.");
    module = game.modules.get("metareact");
    module.status = new Status();
    module.status.render(true);
    this.cleanWindowClass(module.status);

    // Set up UI button listeners
    Array.from(module.status.element[0].querySelectorAll(".module-control")).forEach((el) => {
      el.addEventListener("click", (event) => {
        const approvalText = event.currentTarget.dataset.approval;
        const tokenName = this.getCurrentUserName();

        if (approvalText === "settings") {
          const current = getImagePositionForToken(tokenName);
          const newPos = prompt("On a scale of 0% - 100% how far down do you want your image snippet to be?", current);
          if (newPos) {
            setImagePositionForToken(tokenName, newPos);
          }
          return;
        } else if (approvalText === "custom") {
          const customText = prompt("How does your character react?", "won't remember this.");
          if (customText) this.sendApproval(customText);
          return;
        }

        this.sendApproval(approvalText);
      });
    });
  }

  approval(name, art, approval) {
    const pos = getImagePositionForToken(name);

    const newContainer = document.createElement('div');
    const newTitle = document.createElement('div');

    newContainer.style.height = "70px";
    newContainer.style.width = "300px";
    newContainer.style.transition = "opacity 1s";
    newContainer.style.position = "relative";

    newContainer.style.backgroundImage = `url(${art})`;
    newContainer.style.backgroundSize = "cover";
    newContainer.style.backgroundPosition = `100% ${pos}`;

    newTitle.innerHTML = `${name} ${approval}`;
    newTitle.style.position = "absolute";
    newTitle.style.backgroundColor = "#0000005e";
    newTitle.style.fontSize = "15px";
    newTitle.style.bottom = "0px";
    newTitle.style.left = "0px";
    newTitle.style.width = "300px";
    newTitle.style.padding = "2px";

    module.status.element[0].querySelector(".statusbox").appendChild(newContainer);
    newContainer.appendChild(newTitle);

    setTimeout(() => {
      newContainer.style.opacity = 0;
      setTimeout(() => newContainer.remove(), 1000);
    }, 5000);
  }
}

new MetaReact();

function approval(name, art, approvalText) {
  metaReactInstance?.approval(name, art, approvalText);
}