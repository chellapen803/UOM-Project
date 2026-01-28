import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Message } from '../types';

/**
 * Save chat messages to Firestore
 * Structure: chats/{userId} -> { messages: Message[], updatedAt: Timestamp }
 */
export async function saveChatMessages(userId: string, messages: Message[]): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', userId);
    
    // Convert messages to Firestore-compatible format
    // Firestore doesn't support Date objects, so we keep timestamps as numbers
    const messagesData = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      retrievedContext: msg.retrievedContext || null,
      metadata: msg.metadata || null,
    }));
    
    await setDoc(chatRef, {
      messages: messagesData,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('Error saving chat messages:', error);
    throw error;
  }
}

/**
 * Load chat messages from Firestore
 * Returns empty array if no chat exists
 */
export async function loadChatMessages(userId: string): Promise<Message[]> {
  try {
    const chatRef = doc(db, 'chats', userId);
    const chatDoc = await getDoc(chatRef);
    
    if (!chatDoc.exists()) {
      return [];
    }
    
    const data = chatDoc.data();
    const messages = data.messages || [];
    
    // Convert back to Message format
    return messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      retrievedContext: msg.retrievedContext || undefined,
      metadata: msg.metadata || undefined,
    })) as Message[];
  } catch (error) {
    console.error('Error loading chat messages:', error);
    // Return empty array on error so app can still function
    return [];
  }
}

/**
 * Clear chat messages for a user
 */
export async function clearChatMessages(userId: string): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', userId);
    await setDoc(chatRef, {
      messages: [],
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('Error clearing chat messages:', error);
    throw error;
  }
}











