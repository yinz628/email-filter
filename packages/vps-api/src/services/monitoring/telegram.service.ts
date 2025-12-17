/**
 * Telegram Bot Service for Alert Notifications
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface TelegramMessage {
  title: string;
  body: string;
  alertType?: string;
}

/**
 * Send message via Telegram Bot API
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  message: TelegramMessage
): Promise<{ success: boolean; error?: string }> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return { success: false, error: 'Telegram not configured or disabled' };
  }

  try {
    // Format message with emoji based on alert type
    let emoji = '📢';
    if (message.alertType) {
      switch (message.alertType) {
        case 'SIGNAL_DEAD':
          emoji = '🚨';
          break;
        case 'FREQUENCY_DOWN':
          emoji = '⚠️';
          break;
        case 'SIGNAL_RECOVERED':
          emoji = '✅';
          break;
        case 'RATIO_LOW':
          emoji = '📉';
          break;
        case 'RATIO_RECOVERED':
          emoji = '📈';
          break;
      }
    }

    const text = `${emoji} *${escapeMarkdown(message.title)}*\n\n${escapeMarkdown(message.body)}`;

    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'MarkdownV2',
      }),
    });

    const data = (await response.json()) as { ok: boolean; description?: string };

    if (data.ok) {
      return { success: true };
    } else {
      // Retry without markdown if parsing fails
      const retryResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: `${emoji} ${message.title}\n\n${message.body}`,
        }),
      });
      const retryData = (await retryResponse.json()) as { ok: boolean; description?: string };
      if (retryData.ok) {
        return { success: true };
      }
      return { success: false, error: data.description || 'Unknown error' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Telegram send error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Escape special characters for Telegram MarkdownV2
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Test Telegram configuration by sending a test message
 */
export async function testTelegramConfig(
  config: TelegramConfig
): Promise<{ success: boolean; error?: string }> {
  const testConfig = { ...config, enabled: true };
  return sendTelegramMessage(testConfig, {
    title: '测试消息',
    body: '如果你收到这条消息，说明 Telegram 通知配置成功！',
  });
}
