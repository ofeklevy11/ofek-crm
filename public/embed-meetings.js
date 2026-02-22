(function () {
  "use strict";

  // Find all embed containers
  var containers = document.querySelectorAll("[data-meeting-embed]");

  containers.forEach(function (container) {
    var token = container.getAttribute("data-meeting-embed");
    if (!token) return;

    var baseUrl = container.getAttribute("data-base-url") || "https://your-crm-domain.com";

    var iframe = document.createElement("iframe");
    iframe.src = baseUrl + "/p/meetings/" + token;
    iframe.style.width = "100%";
    iframe.style.border = "none";
    iframe.style.minHeight = "600px";
    iframe.style.borderRadius = "12px";
    iframe.style.overflow = "hidden";
    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("loading", "lazy");

    container.appendChild(iframe);

    // Listen for height messages from the iframe
    window.addEventListener("message", function (event) {
      if (!event.data || typeof event.data !== "object") return;

      if (event.data.type === "meeting-resize" && event.source === iframe.contentWindow) {
        iframe.style.height = event.data.height + "px";
      }

      if (event.data.type === "meeting-booked" && event.source === iframe.contentWindow) {
        // Dispatch custom event for the parent page
        container.dispatchEvent(
          new CustomEvent("meetingBooked", {
            detail: { meetingId: event.data.meetingId },
          })
        );
      }
    });
  });
})();
