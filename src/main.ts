// todo

const app: HTMLDivElement = document.querySelector("#app")!;

const gameTitle: string = "My Game";
document.title = gameTitle;

const header = document.createElement("h1");
header.innerHTML = gameTitle;
app.append(header);

const alertButton = document.createElement("button")!;
alertButton.innerHTML = "Click me!";
app.append(alertButton);

alertButton.addEventListener("click", () => {
  alert("You clicked the button!");
});
