import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type Props = PressableProps & { style?: StyleProp<ViewStyle> };

/**
 * زرار موحّد بيدّي رد فعل بصري لحظة الضغط (بهتان + تصغير خفيف) - بدون
 * أي مكتبة إضافية، بس الـ function-style الأصلي بتاع Pressable.
 * الهدف إن كل عناصر التحكم في التطبيق تحس "حية" وبترد على اللمس،
 * مش بس تتغيّر شاشة فجأة من غير أي إحساس بالتفاعل.
 */
export function PressableScale({ style, children, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      style={state => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && { opacity: 0.72, transform: [{ scale: 0.96 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}
