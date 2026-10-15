window.threeDeeziDownload = function (encoded, name) {
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], {type: name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.pdf') ? 'application/pdf' : 'application/zip'}));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  // Release the file a minute later: releasing it before a slow or busy browser has read it cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
