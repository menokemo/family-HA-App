import { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../theme';
import { i18n } from '../i18n';

type Props = { onConfirm: () => void; disabled?: boolean };

const KNOB = 56;

export function SwipeToDisarm({ onConfirm, disabled }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const pan = useRef(new Animated.Value(0)).current;
  const maxDistance = Math.max(trackWidth - KNOB, 1);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderMove: (_e, gesture) => {
        const value = Math.min(Math.max(gesture.dx, 0), maxDistance);
        pan.setValue(value);
      },
      onPanResponderRelease: (_e, gesture) => {
        if (gesture.dx >= maxDistance * 0.82) {
          Animated.timing(pan, { toValue: maxDistance, duration: 120, useNativeDriver: false }).start(() => {
            onConfirm();
            setTimeout(() => pan.setValue(0), 400);
          });
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
        }
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  return (
    <View style={s.track} onLayout={onLayout}>
      <Text style={s.label}>{i18n.t('swipeToDisarm')}</Text>
      <Animated.View style={[s.knob, { transform: [{ translateX: pan }] }]} {...responder.panHandlers}>
        <Ionicons name="lock-open" size={22} color={colors.black} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: 64, borderRadius: 32, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', overflow: 'hidden' },
  label: { color: colors.muted, textAlign: 'center', fontWeight: '800', letterSpacing: 0.4 },
  knob: { position: 'absolute', left: 4, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
});
