export type OutreachChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'MANUAL';

export interface ChannelInput {
  email?: string;
  phone?: string;
  consent?: boolean;
  optedOut?: boolean;
}

export function chooseOutreachChannel(input: ChannelInput): OutreachChannel {
  if (input.optedOut) return 'MANUAL';
  if (!input.consent && input.email) return 'EMAIL';
  if (input.email) return 'EMAIL';
  if (input.phone && input.consent) return 'WHATSAPP';
  return 'MANUAL';
}
