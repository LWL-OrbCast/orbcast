import Toast from 'react-native-toast-message';

type ToastType = 'success' | 'error' | 'info' | 'copied';

const DEFAULT_TOAST_VISIBILITY_MS = 3000;
export const DEFAULT_TOAST_TOP_OFFSET = 60;
let activeToastTopOffset = DEFAULT_TOAST_TOP_OFFSET;

export function setToastTopOffset(offset: number): void {
  activeToastTopOffset = Number.isFinite(offset) && offset > 0
    ? offset
    : DEFAULT_TOAST_TOP_OFFSET;
}

export function showToast(
  message: string,
  title?: string,
  type?: ToastType,
  visibilityTimeMs?: number,
) {
  Toast.show({
    type: type ?? 'info',
    text1: title || undefined,
    text2: message,
    position: 'top',
    visibilityTime: visibilityTimeMs ?? DEFAULT_TOAST_VISIBILITY_MS,
    autoHide: true,
    topOffset: activeToastTopOffset,
  });
}

export function showSuccessToast(message: string, title?: string, visibilityTimeMs?: number) {
  showToast(message, title, 'success', visibilityTimeMs);
}

export function showErrorToast(message: string, title?: string, visibilityTimeMs?: number) {
  showToast(message, title, 'error', visibilityTimeMs);
}
