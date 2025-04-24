document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById("trackerList");
  
    chrome.runtime.sendMessage({ type: "getTrackers" }, (response) => {
      list.innerHTML = "";
  
      if (!response || response.length === 0) {
        const li = document.createElement("li");
        li.textContent = "Ni zaznanih third-party zahtev.";
        list.appendChild(li);
      } else {
        response.forEach(domain => {
          const li = document.createElement("li");
          li.textContent = domain;
          list.appendChild(li);
        });
      }
    });
  });
  