//sugma

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

const getCurrentUserName = () => canvas.tokens.controlled[0].nameplate._text;
const getCurrentUserArt = () => canvas.tokens.controlled[0].texture.baseTexture.textureCacheIds[0];

const sendApproval = (approval) => {
  console.log(approval);
  const name = getCurrentUserName();
  const art = getCurrentUserArt();
  socket.executeForEveryone("approval", name, art, approval);
};

const cleanWindowClass = (application) => {
  const app = application.element[0];
  app.style.boxShadow = "none";
  app.style.background = "none";
  app.querySelector(".window-content").classList.remove("window-content");
  app.querySelector(".window-header").style.backgroundColor =
    "rgba(0, 0, 0, 0.5)";
  app.querySelector(".window-header").style.border = "0";
  Array.from(app.querySelectorAll("button")).forEach((el) =>
    app.querySelector(".window-header").appendChild(el)
  );
  app.querySelector(".close").remove();
};

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule("metareact");
  socket.register("approval", approval);
  console.log("The socket is ready to be used.");
});

Hooks.once("init", () => {
  console.log("Meta React | Initialising the module.");
  module = game.modules.get("metareact");
  module.status = new Status();
  module.status.render(true);
});

Hooks.once("ready", async () => {
  cleanWindowClass(module.status);
  Array.from(
    module.status.element[0].querySelectorAll(".module-control")
  ).forEach((el) =>
    el.addEventListener("click", (event) => {
      sendApproval(event.currentTarget.dataset.approval);
    })
  );
});

const approval = (name, approval) => {
  let newElement = document.createElement("div");
  //Add transition styles to the new element
  newElement.style.transition = "opacity 1s";
  newElement.style.paddingLeft = "8px";
  newElement.style.backgroundImage = art;
  newElement.style.backgroundSize = "fill";
  console.log(approval);
  newElement.innerHTML = `<p>${name} ${approval}.</p>`;
  module.status.element[0].querySelector(".statusbox").appendChild(newElement);

  setTimeout(() => {
    newElement.style.opacity = 0;
    setTimeout(() => {
      newElement.remove();
    }, 1000);
  }, 5000);
};