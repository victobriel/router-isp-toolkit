export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to the textarea approach below.
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'copyToClipboard',
      text,
    });

    if (response?.success === true) {
      return true;
    }
  } catch {
    // Fall through to legacy execCommand path below.
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';

  try {
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}
