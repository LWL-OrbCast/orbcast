declare module 'react-native-qrcode-styled' {
  import type { ComponentType } from 'react';
  import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

  type EyeOptions = {
    borderRadius?: number | number[];
    color?: ColorValue;
  };

  export type QRCodeStyledProps = {
    data?: string;
    style?: StyleProp<ViewStyle>;
    pieceSize?: number;
    color?: ColorValue;
    pieceCornerType?: 'rounded' | 'cut';
    pieceBorderRadius?: number | number[];
    isPiecesGlued?: boolean;
    padding?: number;
    outerEyesOptions?: {
      topLeft?: EyeOptions;
      topRight?: EyeOptions;
      bottomLeft?: EyeOptions;
    };
    innerEyesOptions?: EyeOptions;
  };

  const QRCodeStyled: ComponentType<QRCodeStyledProps>;
  export default QRCodeStyled;
}
