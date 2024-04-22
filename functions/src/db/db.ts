import {DanceVideo} from "./models";
import {
  getFirestore,
  DocumentData,
  PartialWithFieldValue,
} from "firebase-admin/firestore";
// Import or define your types
// import { YourType } from '~/@types'
const converter = <T>() => ({
  toFirestore: (data: PartialWithFieldValue<T>) => data as DocumentData,
  fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
      snap.data() as T,
});
const dataPoint = <T>(collectionPath: string) =>
  getFirestore().collection(collectionPath).withConverter(converter<T>());
export const db = {
  // list your collections here
  danceVideos: dataPoint<DanceVideo>("dance_video"),
};
