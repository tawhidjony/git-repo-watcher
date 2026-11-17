import { Head } from "fresh/runtime";
import Dashboard from "../islands/Dashboard.tsx";
import { define } from "../utils.ts";

export default define.page(function Home() {
  return (
    <>
      <Head>
        <title>Git repositories</title>
      </Head>
      <Dashboard />
    </>
  );
});
