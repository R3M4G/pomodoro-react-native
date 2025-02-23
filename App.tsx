import { StatusBar } from 'expo-status-bar';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Button, Text, ProgressBar } from 'react-native-paper';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const WORK_TIME = 52 * 60; // 52 minutes in seconds
const BREAK_TIME = 17 * 60; // 17 minutes in seconds

export default function App() {
  const [timeLeft, setTimeLeft] = useState(WORK_TIME);
  const [isActive, setIsActive] = useState(false);
  const [isWorkPhase, setIsWorkPhase] = useState(true);
  const [targetTime, setTargetTime] = useState<number | null>(null);
  const [notificationId, setNotificationId] = useState<string | null>(null);

  useEffect(() => {
    setupNotificationChannel();
    loadSavedState();
    AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      AppState.addEventListener('change', handleAppStateChange);
    };
  }, []);

  const setupNotificationChannel = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('pomodoro-timer', {
        name: 'Pomodoro Timer',
        importance: Notifications.AndroidImportance.HIGH,
        sound: null,
        vibrationPattern: [0, 250, 250, 250],
        enableLights: true,
      });
    }
  };

  const loadSavedState = async () => {
    const savedTargetTime = await AsyncStorage.getItem('targetTime');
    const savedIsWorkPhase = await AsyncStorage.getItem('isWorkPhase');
    
    if (savedTargetTime) {
      const parsedTime = parseInt(savedTargetTime, 10);
      const remaining = Math.floor((parsedTime - Date.now()) / 1000);
      
      if (remaining > 0) {
        setTargetTime(parsedTime);
        setTimeLeft(remaining);
        setIsActive(true);
        setIsWorkPhase(savedIsWorkPhase === 'true');
      }
    }
  };

  const handleAppStateChange = async (nextState: string) => {
    if (nextState === 'active' && targetTime) {
      const remaining = Math.floor((targetTime - Date.now()) / 1000);
      setTimeLeft(Math.max(0, remaining));
      
      if (remaining <= 0) {
        handleTimerEnd();
      }
    }
  };

  const handleTimerEnd = async () => {
    setIsActive(false);
    setTargetTime(null);
    // await playSound();
    await sendEndNotification();
    await togglePhase();
    await clearSavedState();
  };

  const sendEndNotification = async () => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time\'s up!',
        body: `Your ${isWorkPhase ? 'work' : 'break'} session has ended.`,
        sound: true,
      },
      trigger: null,
    });
  };

  const togglePhase = async () => {
    setIsWorkPhase(prev => !prev);
    setTimeLeft(prev => prev === WORK_TIME ? BREAK_TIME : WORK_TIME);
  };

  const clearSavedState = async () => {
    await AsyncStorage.multiRemove(['targetTime', 'isWorkPhase']);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive && targetTime) {
      interval = setInterval(() => {
        const remaining = Math.floor((targetTime - Date.now()) / 1000);
        setTimeLeft(Math.max(0, remaining));
        
        if (remaining <= 0) {
          clearInterval(interval);
          handleTimerEnd();
        }
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [isActive, targetTime]);

  // const updateNotification = async (remaining: number) => {
  //   if (!notificationId) return;
    
  //   await Notifications.scheduleNotificationAsync({
  //     content: {
  //       title: `${isWorkPhase ? 'Work' : 'Break'} Time`,
  //       body: `Remaining: ${formatTime(remaining)}`,
  //     },
  //     identifier: notificationId,
  //     trigger: null,
  //   });
  // };

  const startTimer = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') await Notifications.requestPermissionsAsync();

    const newTargetTime = Date.now() + timeLeft * 1000;
    setTargetTime(newTargetTime);
    setIsActive(true);
    
    await AsyncStorage.setItem('targetTime', newTargetTime.toString());
    await AsyncStorage.setItem('isWorkPhase', isWorkPhase.toString());
    
    const id = await scheduleNotification(newTargetTime);
    setNotificationId(id);
  };

  const scheduleNotification = async (target: number) => {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: `${isWorkPhase ? 'Work' : 'Break'} Time`,
        body: `Remaining: ${formatTime(timeLeft)}`,
      },
      trigger: null,
      identifier: 'pomodoro-timer',
    });
  };

  const pauseTimer = async () => {
    setIsActive(false);
    await clearSavedState();
    if(notificationId) {
      await Notifications.dismissNotificationAsync(notificationId);
      scheduleNotification(Date.now() + timeLeft * 1000);
    }
  }

  const resetTimer = async () => {
    setIsActive(false);
    setIsWorkPhase(true);
    setTimeLeft(WORK_TIME);
    setTargetTime(null);
    await clearSavedState();
    
    if (notificationId) {
      await Notifications.dismissNotificationAsync(notificationId);
      setNotificationId(null);
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.phaseText}>
        {isWorkPhase ? 'Work' : 'Break'} Time
      </Text>
      <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
      <ProgressBar
        progress={timeLeft / (isWorkPhase ? WORK_TIME : BREAK_TIME)}
        color="#8BE9FD"
        style={styles.progressBar}
      />
      <Button
        mode="contained"
        onPress={isActive ? pauseTimer : startTimer}
        style={isActive ? styles.button1 : styles.button}
        labelStyle={styles.buttonLabel}
      >
        {isActive ? 'pause' : 'Start'}
      </Button>
      <Button
        mode="contained"
        onPress={resetTimer}
        style={styles.button2}
        labelStyle={styles.buttonLabel}
        >
          reset
        </Button>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#282A36',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  phaseText: {
    fontSize: 24,
    marginBottom: 20,
    color: '#F1FA8C',
    fontWeight: 'bold',
  },
  timerText: {
    fontSize: 72,
    fontWeight: 'bold',
    marginVertical: 30,
    color: '#F8F8F2',
  },
  progressBar: {
    width: 200,
    height: 10,
    marginVertical: 20,
    borderRadius: 5,
  },
  button: {
    marginTop: 30,
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 25,
    backgroundColor: '#50FA7B',
  },
  button1: {
    marginTop: 30,
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 25,
    backgroundColor: '#BD93F9',
  },
  button2: {
    marginTop: 30,
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 25,
    backgroundColor: '#FF5555',
  },
  buttonLabel: {
    fontSize: 18,
    color: '#282A36',
  },
});
