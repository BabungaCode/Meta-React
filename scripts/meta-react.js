let socket;
let module;
let imgpos = "15%";


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
    console.log("The socket is ready to be used.");
  }

  onInit() {
    console.log("Meta React | Initialising the module.");
    module = game.modules.get("metareact");
    module.status = new Status();
    module.status.render(true);
  }

  onReady() {
    this.cleanWindowClass(module.status);
    Array.from(module.status.element[0].querySelectorAll(".module-control")).forEach((el) => {
      el.addEventListener("click", (event) => {
        const approvalText = event.currentTarget.dataset.approval;
        if (approvalText === "settings" ){
          let imgpos = prompt("On a scale of 0% - 100% how far down do you want your img snippet to be.", "15%");
          return;
        }else{
        this.sendApproval(approvalText);}
      });
    });
  }

  approval(name, art, approval) {
    let newContainer = document.createElement('div');
    let newImage = document.createElement('div')
    let newTitle = document.createElement('p')
    
    newContainer.style.padding = "8px";
    newContainer.style.height = "60px";
    newContainer.style.transition = "opacity 10s";

    newImage.style.backgroundImage = `url(${art})`;
    newImage.style.backgroundSize = "80%";
    newImage.style.backgroundPosition = "100% " + imgpos;
    
    newTitle.innerHTML = `${name} ${approval}`;
    newTitle.style.textShadow = "0px 0px 30px #000000";
    newTitle.style.fontSize = "18px";
    newTitle.style.bottom = "2px";

    module.status.element[0].querySelector(".statusbox").appendChild(newContainer);
    newContainer.appendChild(newTitle);
    newContainer.appendChild(newImage);

    setTimeout(() => {
      newElement.style.opacity = 0;
      setTimeout(() => newElement.remove(), 10000);
    }, 5000);
  }
}

new MetaReact();

function approval(name, art, approvalText) {
  metaReactInstance?.approval(name, art, approvalText)
}