const NOTION_TOKEN_KEY = 'algonotion_notion_token';
const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';

const notionTokenInput = document.getElementById('notion-token');
const notionDatabaseIdInput = document.getElementById('notion-database-id');
const saveButton = document.getElementById('save-button');
const statusLabel = document.getElementById('status');

function showStatus(message) {
  if (!statusLabel) return;
  statusLabel.textContent = message;
  window.setTimeout(() => {
    statusLabel.textContent = '';
  }, 2000);
}

function restoreOptions() {
  chrome.storage.local.get(
    [NOTION_TOKEN_KEY, NOTION_DATABASE_ID_KEY],
    (result) => {
      if (notionTokenInput && typeof result[NOTION_TOKEN_KEY] === 'string') {
        notionTokenInput.value = result[NOTION_TOKEN_KEY];
      }
      if (notionDatabaseIdInput && typeof result[NOTION_DATABASE_ID_KEY] === 'string') {
        notionDatabaseIdInput.value = result[NOTION_DATABASE_ID_KEY];
      }
    },
  );
}

function saveOptions() {
  const notionToken = notionTokenInput ? notionTokenInput.value.trim() : '';
  const notionDatabaseId = notionDatabaseIdInput ? notionDatabaseIdInput.value.trim() : '';

  chrome.storage.local.set(
    {
      [NOTION_TOKEN_KEY]: notionToken,
      [NOTION_DATABASE_ID_KEY]: notionDatabaseId,
    },
    () => {
      showStatus('설정이 저장되었습니다.');
    },
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreOptions);
} else {
  restoreOptions();
}

if (saveButton) {
  saveButton.addEventListener('click', saveOptions);
}
