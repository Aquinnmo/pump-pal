import styles from "./page.module.css"; 

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div>
          <h1>Login</h1>
          <div>
            <p>Email:</p>
            <input name="Email"></input>
          </div>
          <div>
            <p>Password:</p>
            <input name="Password"></input>
          </div>
        </div>
      </main>
    </div>
  );
}
